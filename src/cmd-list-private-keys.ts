import { IccCryptoXApi, IccHcpartyXApi, IccPatientXApi, IccUserXApi, User } from '@icure/api'
import { IccDeviceApi } from '@icure/api/icc-api/api/IccDeviceApi'
import { Args, CommandInstance } from 'vorpal'

export const cmdListPrivateKeys = async (
  cmd: CommandInstance,
  args: Args,
  api: {
    cryptoApi: IccCryptoXApi
    userApi: IccUserXApi
    patientApi: IccPatientXApi
    healthcarePartyApi: IccHcpartyXApi
    deviceApi: IccDeviceApi
  }
): Promise<void> => {
  const users = (await api.userApi.listUsers()).rows || []
  await users.reduce(async (p: Promise<any>, u: User) => {
    await p
    if (u.healthcarePartyId) {
      const hcp = await api.healthcarePartyApi.getHealthcareParty(u.healthcarePartyId)
      try {
        if (hcp.publicKey && (await api.cryptoApi.checkPrivateKeyValidity(hcp))) {
          cmd.log(`√ ${hcp.id}: ${hcp.firstName} ${hcp.lastName}`)
        } else {
          cmd.log(`X ${hcp.id}: ${hcp.firstName} ${hcp.lastName}`)
        }
      } catch (e) {
        cmd.log(`X ${hcp.id}: ${hcp.firstName} ${hcp.lastName}`)
      }
    }
  }, Promise.resolve())
}
