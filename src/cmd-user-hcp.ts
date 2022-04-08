import {
  IccAccesslogXApi,
  IccAgendaApi,
  IccAuthApi,
  IccCalendarItemXApi,
  IccClassificationXApi,
  IccCodeXApi,
  IccContactXApi,
  IccCryptoXApi,
  IccDocumentXApi,
  IccEntityrefApi,
  IccFormXApi,
  IccGroupApi,
  IccHcpartyXApi,
  IccHelementXApi,
  IccInsuranceApi,
  IccInvoiceXApi,
  IccMessageXApi,
  IccPatientXApi,
  IccReceiptXApi,
  IccTimeTableXApi,
  IccUserXApi,
} from '@icure/api'
import { Args, CommandInstance } from 'vorpal'
import { HealthcareProfessional, MedTechApi, User } from '@icure/medical-device-sdk'
import { IccDeviceApi } from '@icure/api/icc-api/api/IccDeviceApi'

export const cmdUserHcp = async (
  cmd: CommandInstance,
  args: Args,
  api: {
    cryptoApi: IccCryptoXApi
    authApi: IccAuthApi
    codeApi: IccCodeXApi
    userApi: IccUserXApi
    patientApi: IccPatientXApi
    healthcarePartyApi: IccHcpartyXApi
    deviceApi: IccDeviceApi
    accessLogApi: IccAccesslogXApi
    contactApi: IccContactXApi
    healthcareElementApi: IccHelementXApi
    documentApi: IccDocumentXApi
    formApi: IccFormXApi
    invoiceApi: IccInvoiceXApi
    insuranceApi: IccInsuranceApi
    messageApi: IccMessageXApi
    entityReferenceApi: IccEntityrefApi
    receiptApi: IccReceiptXApi
    agendaApi: IccAgendaApi
    calendarItemApi: IccCalendarItemXApi
    classificationApi: IccClassificationXApi
    timetableApi: IccTimeTableXApi
    groupApi: IccGroupApi
  },
  options: {
    host: string
    password: string
    username: string
  }
): Promise<void> => {
  const medtechApi = new MedTechApi(api, options.host, options.username, options.password)

  const rawKeyPair: CryptoKeyPair = await medtechApi.cryptoApi.RSA.generateKeyPair()
  const keyPair = await medtechApi.cryptoApi.RSA.exportKeys(
    rawKeyPair as { publicKey: CryptoKey; privateKey: CryptoKey },
    'jwk',
    'jwk'
  )

  const hcp = await medtechApi.healthcareProfessionalApi.createOrModifyHealthcareProfessional(
    new HealthcareProfessional({
      name: args.name,
      parentId: args.parentId ?? undefined,
      systemMetaData: {
        publicKey: medtechApi.cryptoApi.utils.jwk2spki(keyPair.publicKey),
        hcPartyKeys: {},
        privateKeyShamirPartitions: {},
      },
    })
  )

  const user = await medtechApi.userApi.createOrModifyUser(
    new User({
      login: args.email,
      passwordHash: args.password,
      email: args.email,
      healthcarePartyId: hcp.id,
    })
  )

  cmd.log(`user id: ${user.id}, hcp id ${hcp.id}`)
  cmd.log(`hcp private key:`)
  cmd.log(medtechApi.cryptoApi.utils.jwk2pkcs8(keyPair.privateKey))
}
