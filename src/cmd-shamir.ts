import { hex2ua, IccCryptoXApi, IccUserXApi, ua2hex } from '@icure/api'
import { Args, CommandInstance } from 'vorpal'

export const cmdShamir = async (
  cmd: CommandInstance,
  args: Args,
  api: { cryptoApi: IccCryptoXApi; userApi: IccUserXApi }
) => {
  const user = await api.userApi.getCurrentUser()

  cmd.log(
    (
      await Promise.all(
        (args.hcpIds.length > 1
          ? api.cryptoApi.shamir.share(args.secret, args.hcpIds.length, Number(args.threshold))
          : [args.secret]
        ).map(async (s, idx) => {
          const keys = await api.cryptoApi.decryptAndImportAesHcPartyKeysForDelegators(
            [user.healthcarePartyId!],
            args.hcpIds[idx]
          )
          const hcpKey = keys.find((k) => k.delegatorId === user.healthcarePartyId!)!
          return [
            hcpKey.delegatorId,
            ua2hex(await api.cryptoApi.AES.encrypt(hcpKey.key, hex2ua(s))),
          ]
        })
      )
    )
      .map(([k, v]) => `${k} : ${v}`)
      .join('\n')
  )
}
