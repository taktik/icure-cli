import fetch from 'node-fetch'
import { ContactDto, DelegationDto, Filter, ImportResultDto, ListOfIdsDto, PatientDto, UserDto } from 'icc-api'
import { chunk, flatMap, uniqBy } from 'lodash'
import { addDays, format, parse } from 'date-fns'
import { Api } from './api'

import * as colors from 'colors/safe'
import { Args, CommandInstance } from 'vorpal'

require('node-json-color-stringify')

const request = require('request')
const path = require('path')
const fs = require('fs')
const vorpal = new (require('vorpal'))()

// TODO use a logger
// TODO patient merges
// TODO more examples, with invoices/health elements/contacts, at first level

const tmp = require('os').tmpdir()
console.log('Tmp dir: ' + tmp)
;(global as any).localStorage = new (require('node-localstorage').LocalStorage)(tmp, 5 * 1024 * 1024 * 1024)
;(global as any).Storage = ''

const options = {
	username: 'abdemo',
	password: 'knalou',
	host: 'https://backendb.svc.icure.cloud/rest/v1',
	repoUsername: null,
	repoPassword: null,
	repoHost: null,
	repoHeader: {}
}

let api = new Api(options.host, { Authorization: `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}` }, fetch as any)
let latestImport: ImportResultDto
let latestExport: ArrayBufferLike

vorpal
	.command('login <username> <password> [host]', 'Login to iCure')
	.action(async function(this: CommandInstance, args: Args) {
		options.username = args.username
		options.password = args.password
		args.host && (options.host = args.host)

		api = new Api(options.host, { Authorization: `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}` }, fetch as any)
	})

vorpal
	.command('pki <hcpId> <key>', 'Private Key Import')
	.action(async function(this: CommandInstance, args: Args) {
		const hcpId = args.hcpId
		const key = args.key

		await api.cryptoicc.loadKeyPairsAsTextInBrowserLocalStorage(hcpId, api.cryptoicc.utils.hex2ua(key))
		if (await api.cryptoicc.checkPrivateKeyValidity(await api.hcpartyicc.getHealthcareParty(hcpId))) {
			this.log('Key is valid')
		} else {
			this.log('Key is invalid')
		}
	})

vorpal
	.command('lpkis', 'List Private Keys')
	.action(async function(this: CommandInstance, args: Args) {
		const users = (await api.usericc.listUsers(undefined, undefined, undefined)).rows
		users.reduce(async (p: Promise<any>, u: UserDto) => {
			await p
			if (u.healthcarePartyId) {
				const hcp = await api.hcpartyicc.getHealthcareParty(u.healthcarePartyId)
				try {
					if (hcp.publicKey && await api.cryptoicc.checkPrivateKeyValidity(hcp)) {
						this.log(`${colors.green('√')} ${hcp.id}: ${hcp.firstName} ${hcp.lastName}`)
					} else {
						this.log(`${colors.red('X')} ${hcp.id}: ${hcp.firstName} ${hcp.lastName}`)
					}
				} catch (e) {
					this.log(`X ${hcp.id}: ${hcp.firstName} ${hcp.lastName}`)
				}
			}
		}, Promise.resolve())
	})

vorpal
	.command('whoami', 'Logged user info')
	.action(async function(this: CommandInstance, args: Args) {
		let user = await api.usericc.getCurrentUser()
		this.log(user.login + '@' + options.host)
		this.log(JSON.stringify(user, null, ' '))
		this.log(JSON.stringify(await api.hcpartyicc.getCurrentHealthcareParty(), null, ' '))
	})

vorpal
	.command('pat [name] [first]', 'Logged user info')
	.action(async function(this: CommandInstance, args: Args) {
		this.log(JSON.stringify((await api.patienticc.fuzzySearchWithUser(await api.usericc.getCurrentUser(), args.first, args.name, undefined))
			.map((p: PatientDto) => ({ id: p.id, lastName: p.lastName, firstName: p.firstName }))))
	})

vorpal
	.command('missingdel <entity> [hcpIds...]', 'Get list of mismatch access on list of hcp id')
	.action(async function(this: CommandInstance, args: Args) {
		const all = {}
		const byHcp = {} as any
		let user = await api.usericc.getCurrentUser()

		await Promise.all(args.hcpIds.map(async (hcpId: string) => {
			const batchIds = await api.contacticc.matchBy(new Filter({
				healthcarePartyId: hcpId,
				$type: 'ContactByHcPartyTagCodeDateFilter'
			}))
			const batch = batchIds
				.reduce((acc: { [key: string]: number }, id: string) => {
					acc[id] = 1
					return acc
				}, {})
			byHcp[hcpId] = batch
			Object.assign(all, batch)
		}))

		const incomplete = Object.keys(all).filter(id => Object.keys(byHcp).some(k => !byHcp[k][id]))

		const patIds = await contactsToPatientIds(user.healthcarePartyId, await api.contacticc.getContactsWithUser(user, new ListOfIdsDto({ ids: incomplete })))

		this.log(JSON.stringify(patIds))
	})

vorpal
	.command('share <hcpId> [patIds...]', 'Share with hcp ids')
	.action(async function(this: CommandInstance, args: Args) {
		let user = await api.usericc.getCurrentUser()

		const hcpId = args.hcpId
		const ids = args.patIds

		const patients = await api.patienticc.getPatientsWithUser(user, new ListOfIdsDto({ ids })) // Get them to fix them

		this.log(JSON.stringify((await patients.reduce(async (p: Promise<any>, pat: PatientDto) => {
			const prev = await p
			try {
				return prev.concat([await api.patienticc.share(user, pat.id!, user.healthcarePartyId!, [hcpId], { [hcpId]: ['all'] })])
			} catch (e) {
				console.log(e)
				return prev
			}
		}
			, Promise.resolve([]))).map((x: any) => x.statuses), undefined, ' '))
	})

vorpal
	.command('shareall [hcpIds...]', 'Share with hcp ids')
	.action(async function(this: CommandInstance, args: Args) {
		let user = await api.usericc.getCurrentUser()

		const hcpIds = args.hcpIds as string[]
		const allIds = await api.patienticc.listPatientsIds(user.healthcarePartyId, undefined, undefined, 50000)

		chunk(allIds.rows, 100).reduce(async (p, ids) => {
			await p
			const patients = await api.patienticc.getPatientsWithUser(user, new ListOfIdsDto({ ids })) // Get them to fix them

			this.log('Treating 100 patients')

			this.log(JSON.stringify((await patients.reduce(async (p: Promise<any>, pat: PatientDto) => {
				const prev = await p
				try {
					return prev.concat([await api.patienticc.share(user, pat.id!, user.healthcarePartyId!, hcpIds, hcpIds.reduce((map, hcpId) => Object.assign(map, { [hcpId]: ['all'] }), {}))])
				} catch (e) {
					console.log(e)
					return prev
				}
			}
				, Promise.resolve([]))).map((x: any) => x.statuses), undefined, ' '))

		}, Promise.resolve())
	})

vorpal
	.command('imp-ms [path]', 'Convert local medication scheme xml to services')
	.action(async function(this: CommandInstance, args: Args) {
		const user = await api.usericc.getCurrentUser()
		const doc = await api.documenticc.createDocument({
			id: api.cryptoicc.randomUuid(),
			author: user.id,
			responsible: user.healthcarePartyId
		})
		await api.documenticc.setAttachment(doc.id, undefined, fs.readFileSync(args.path).buffer)
		latestImport = (await api.bekmehricc.importMedicationScheme(doc.id, undefined, true, undefined, 'fr', {}))[0]
		this.log(JSON.stringify(latestImport))
	})

vorpal
	.command('shamir [secret] [threshold] [hcpIds...]', 'Generate shamir partitions for hcpIds')
	.action(async function(this: CommandInstance, args: Args) {
		const user = await api.usericc.getCurrentUser()

		this.log((await Promise.all((args.hcpIds.length > 1 ? api.cryptoicc.shamir.share(args.secret, args.hcpIds.length, Number(args.threshold)) : [args.secret]).map(
			async (s, idx) => {
				let keys = await api.cryptoicc.decryptAndImportAesHcPartyKeysForDelegators([user.healthcarePartyId], args.hcpIds[idx])
				const hcpKey = keys.find(k => k.delegatorId === user.healthcarePartyId)!
				return [hcpKey.delegatorId, api.cryptoicc.utils.ua2hex(await api.cryptoicc.AES.encrypt(hcpKey.key, api.cryptoicc.utils.hex2ua(s)))]
			}
		))).map(([k, v]) => `${k} : ${v}`).join('\n'))
	})

vorpal
	.command('checkhcpkey [from] [to]', 'Check that both parts of a hcpartykey are the same')
	.action(async function(this: CommandInstance, args: Args) {
		const key = (await api.hcpartyicc.getHealthcareParty(args.from)).hcPartyKeys![args.to]

		const fromToFrom = await api.cryptoicc.decryptHcPartyKey(args.from, args.to, key[0], true)
		const fromToTo = await api.cryptoicc.decryptHcPartyKey(args.from, args.to, key[1], false)

		this.log(`${args.from} -> ${args.to} : ${fromToFrom.rawKey}`)
		this.log(`${args.from} <- ${args.to} : ${fromToTo.rawKey}`)
	})

vorpal
	.command('analctc [objectId]', 'Check that both parts of a hcpartykey are the same')
	.action(async function(this: CommandInstance, args: Args) {
		const hcp = await api.hcpartyicc.getCurrentHealthcareParty()
		const parent = hcp.parentId && await api.hcpartyicc.getHealthcareParty(hcp.parentId)

		const key = (await api.hcpartyicc.getHealthcareParty(hcp.id)).hcPartyKeys![hcp.id]
		const keyParent = parent && (await api.hcpartyicc.getHealthcareParty(hcp.id)).hcPartyKeys![parent.id]

		this.log('Analyse hcpKeys')

		let selfKey1 = (await api.cryptoicc.decryptHcPartyKey(hcp.id, hcp.id, key[0], true)).rawKey
		let selfKey2 = (await api.cryptoicc.decryptHcPartyKey(hcp.id, hcp.id, key[1], false)).rawKey

		this.log(`${hcp.id} -> ${hcp.id} : ${selfKey1}`)
		this.log(`${hcp.id} <- ${hcp.id} : ${selfKey2}`)

		if (keyParent) {
			let toParentKey1 = (await api.cryptoicc.decryptHcPartyKey(hcp.id, parent.id, keyParent[0], true)).rawKey
			let toParentKey2 = (await api.cryptoicc.decryptHcPartyKey(hcp.id, parent.id, keyParent[1], false)).rawKey

			this.log(`${hcp.id} -> ${parent.id} : ${toParentKey1}`)
			this.log(`${hcp.id} <- ${parent.id} : ${toParentKey2}`)
		}
		const ctc = await api.rawContacticc.getContact(args.objectId)

		const allDelegationLikes = uniqBy(flatMap([ctc.delegations[hcp.id], ctc.encryptionKeys[hcp.id], ctc.cryptedForeignKeys[hcp.id]].concat(parent ? [ctc.delegations[parent.id], ctc.encryptionKeys[parent.id], ctc.cryptedForeignKeys[parent.id]] : [])), x => x.owner + x.delegatedTo)

		const keys = await allDelegationLikes.reduce(async (p,d: DelegationDto) => {
			const keys = await p
			const from = await api.hcpartyicc.getHealthcareParty(d.owner!)
			const key = from.hcPartyKeys![d.delegatedTo!]
			keys[`${d.owner!}->${d.delegatedTo}`] = await api.cryptoicc.decryptHcPartyKey(d.owner!, d.delegatedTo!, key[1], false)
			this.log(`${d.owner!} -> ${d.delegatedTo!} : ${keys[`${d.owner!}->${d.delegatedTo}`].rawKey}`)
			return keys
		}, Promise.resolve({}))

		api.cryptoicc.AES.debug = true

		this.log('Analyse delegations')

		const analyseDelegationLike = async (delegations: { [p: string]: Array<DelegationDto> }, hcpId: string , title: string) => {
			this.log(`>>>>> ${title} : ${hcpId} <<<<<`)
			await delegations[hcpId].reduce(async (p: Promise<any>, d: DelegationDto) => {
				await p
				this.log(`${title}: ${d.owner!} -> ${d.delegatedTo!} : ${api.cryptoicc.utils.ua2text(await api.cryptoicc.AES.decrypt(keys[`${d.owner!}->${d.delegatedTo}`].key, api.cryptoicc.utils.hex2ua(d.key!).buffer))}`)
			}, Promise.resolve())

			const decryptedAndImportedAesHcPartyKeys = await api.cryptoicc.decryptAndImportAesHcPartyKeysInDelegations(hcpId, delegations, false)
			const collatedAesKeysFromDelegatorToHcpartyId = {} as { [key: string]: { delegatorId: string; key: CryptoKey; rawKey: string } }
			decryptedAndImportedAesHcPartyKeys.forEach(k => {
				collatedAesKeysFromDelegatorToHcpartyId[k.delegatorId] = k
			})
			this.log(`Hcparty keys from api : ${JSON.stringify(Object.keys(collatedAesKeysFromDelegatorToHcpartyId).map(k => ({ [k]: collatedAesKeysFromDelegatorToHcpartyId[k].rawKey })))}`)
			this.log(`${title} from api : ${JSON.stringify(await api.cryptoicc.decryptKeyInDelegationLikes(delegations[hcpId], collatedAesKeysFromDelegatorToHcpartyId, ctc.id))}`)
		}

		await analyseDelegationLike(ctc.delegations, hcp.id, 'Delegation')
		parent && await analyseDelegationLike(ctc.delegations, parent.id, 'Delegation')
		await analyseDelegationLike(ctc.encryptionKeys, hcp.id, 'Encryption key')
		parent && await analyseDelegationLike(ctc.encryptionKeys, parent.id, 'Encryption key')
		await analyseDelegationLike(ctc.cryptedForeignKeys, hcp.id, 'Crypted foreign key')
		parent && await analyseDelegationLike(ctc.cryptedForeignKeys, parent.id, 'Crypted foreign key')

		this.log('Decrypt with hcp')
		this.log(JSON.stringify((await api.contacticc.decrypt(hcp.id, [ctc]))[0].services!.map(svc => svc.content!.fr)))
		if (parent) {
			this.log('Decrypt with parent')
			this.log(JSON.stringify((await api.contacticc.decrypt(parent.id, [ctc]))[0].services!.map(svc => svc.content!.fr)))
		}
	})

vorpal
	.command('ibh [year]', 'Inject bank holidays')
	.action(async function(this: CommandInstance, args: Args) {
		const user = await api.usericc.getCurrentUser()

		request(`https://jours-feries-france.antoine-augusti.fr/api/${args.year}`, options, async (error: any, res: any, body: string) => {
			if (error) {
				return this.log(error)
			}

			if (!error && res.statusCode === 200) {
				await Promise.all(JSON.parse(body).map(async (bh: any) => {
					this.log(`Injecting ${bh.date} : ${bh.nom_jour_ferie}`)
					return api.timetableicc.createTimeTable(
						await api.timetableicc.newInstance(user, {
							agendaId: user.id,
							name: bh.nom_jour_ferie,
							startTime: +format(parse(bh.date, 'yyyy-MM-dd', 0), 'yyyyMMddHHmmss'),
							endTime: +format(addDays(parse(bh.date, 'yyyy-MM-dd', 0), 1), 'yyyyMMddHHmmss'),
							tags: [
								{
									type: 'LUTA-DAY-AVAILABILITY',
									version: '1.0',
									code: 'bankholiday'
								}
							]
						})
					)
				}))
			}

		})
	})

vorpal
	.delimiter('icure-cli$')
	.history('icrprt')
	.show()

async function contactsToPatientIds(hcpartyId: string, contacts: ContactDto[]): Promise<string[]> {
	try {
		const extractPromises = contacts.map((ctc: ContactDto) => {
			return api.cryptoicc.extractKeysFromDelegationsForHcpHierarchy(hcpartyId, ctc.id || '', ctc.cryptedForeignKeys || {}).catch(() => ({ extractedKeys: [] }))
		})
		const extracted = await Promise.all(extractPromises)
		return [...new Set(flatMap(extracted, it => it.extractedKeys))]
	} catch (error) {
		console.error('Error while converting contacts to patient ids')
		console.error(error)
		return Promise.reject()
	}
}
