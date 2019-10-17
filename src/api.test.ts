import { Api } from './api'
import fetch from 'node-fetch'
import { ContactDto, MedicationSchemeExportInfoDto } from 'icc-api'
import { flatMap } from 'lodash'

const fs = require('fs')
const xml2js = require('xml2js')

const tmp = require('os').tmpdir()
;(global as any).localStorage = new (require('node-localstorage').LocalStorage)(tmp, 5 * 1024 * 1024 * 1024)
;(global as any).Storage = ''

const options = {
	username: 'abdemo',
	password: 'knalou',
	// host: 'https://backendb.svc.icure.cloud/rest/v1',
	host: 'http://127.0.0.1:16043/rest/v1',
	repoUsername: null,
	repoPassword: null,
	repoHost: null,
	repoHeader: {}
}

let api = new Api(options.host, { Authorization: `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}` }, fetch as any)

jest.setTimeout(60000)

test('I can log in', async () => {
	expect((await api.usericc.getCurrentUser()).login).toBe('abdemo')
})

test('I can import xml', async () => {
	const buffer = fs.readFileSync('./resources/medicationscheme/S01_CD-ADMINISTRATIONUNIT_evs.xml')
	const kmehrImport = await importXml(api.cryptoicc.randomUuid(), buffer)
	expect(kmehrImport).toBeTruthy()
	expect(kmehrImport!.ctcs!.length).toBe(44)
})

test('I can import and export xml', async () => {
	const buffer = fs.readFileSync('./resources/medicationscheme/S01_CD-ADMINISTRATIONUNIT_evs.xml')
	const kmehrImport = await importXml(api.cryptoicc.randomUuid(), buffer)
	expect(kmehrImport).toBeTruthy()
	expect(kmehrImport!.ctcs!.length).toBe(44)
	const kmehrExport = await api.bekmehricc.generateMedicationSchemeExport(kmehrImport.patient!.id!, 'fr', undefined, new MedicationSchemeExportInfoDto({
		services: flatMap(kmehrImport.ctcs!.map((c: ContactDto) => c.services))
	}))
	let xml2 = api.cryptoicc.utils.ua2utf8(kmehrExport)
	expect(xml2.length).toBeGreaterThan(10000)
	const comparison = compareXml(api.cryptoicc.utils.ua2utf8(buffer.buffer), xml2)
})

async function importXml(id: string, buffer: Buffer) {
	let user = await api.usericc.getCurrentUser()
	const doc = await api.documenticc.createDocument({
		id: id,
		author: user.id,
		responsible: user.healthcarePartyId
	})
	await api.documenticc.setAttachment(doc.id, undefined, buffer.buffer as any)
	return (await api.bekmehricc.importMedicationScheme(doc.id, undefined, undefined, 'fr', {}))[0]
}

async function compareXml(xml1: string, xml2: string) {
	const [json1, json2] = await Promise.all([new xml2js.Parser().parseStringPromise(xml1), new xml2js.Parser().parseStringPromise(xml2)])
	console.log(JSON.stringify(json1))
	console.log(JSON.stringify(json2))
}
