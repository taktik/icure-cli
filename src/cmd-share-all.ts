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
  ListOfIds,
  Patient,
} from '@icure/api'
import { IccDeviceApi } from '@icure/api/icc-api/api/IccDeviceApi'
import { Args, CommandInstance } from 'vorpal'
import { chunk } from './utils'

export const cmdShareAll = async function (
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
  }
) {
  const user = await api.userApi.getCurrentUser()

  const hcpIds = args.hcpIds as string[]
  const allIds = await api.patientApi.listPatientsIds(
    user.healthcarePartyId!,
    undefined,
    undefined,
    50000
  )

  await chunk(allIds.rows ?? [], 100).reduce(async (p, ids) => {
    await p
    const patients = await api.patientApi.getPatientsWithUser(user, new ListOfIds({ ids })) // Get them to fix them

    cmd.log('Treating 100 patients')

    cmd.log(
      JSON.stringify(
        (
          await patients.reduce(async (pp: Promise<any>, pat: Patient) => {
            const prev = await pp
            try {
              return prev.concat([
                await api.patientApi.share(
                  user,
                  pat.id!,
                  user.healthcarePartyId!,
                  hcpIds,
                  hcpIds.reduce((map, hcpId) => Object.assign(map, { [hcpId]: ['all'] }), {})
                ),
              ])
            } catch (e) {
              console.log(e)
              return prev
            }
          }, Promise.resolve([]))
        ).map((x: any) => x.statuses),
        undefined,
        ' '
      )
    )
  }, Promise.resolve())
}
