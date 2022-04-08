import { IccPatientXApi, IccUserXApi, ListOfIds, Patient } from '@icure/api'
import { Args, CommandInstance } from 'vorpal'

export const cmdShare = async (
  cmd: CommandInstance,
  args: Args,
  api: { userApi: IccUserXApi; patientApi: IccPatientXApi }
): Promise<void> => {
  const user = await api.userApi.getCurrentUser()

  const hcpId = args.hcpId
  const ids = args.patIds

  const patients = await api.patientApi.getPatientsWithUser(user, new ListOfIds({ ids })) // Get them to fix them

  cmd.log(
    JSON.stringify(
      (
        await patients.reduce(async (p: Promise<any>, pat: Patient) => {
          const prev = await p
          try {
            return prev.concat([
              await api.patientApi.share(user, pat.id!, user.healthcarePartyId!, [hcpId], {
                [hcpId]: ['all'],
              }),
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
}
