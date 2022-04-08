import { Args, CommandInstance } from 'vorpal'
import { IccPatientXApi, IccUserXApi, Patient } from '@icure/api'

export const cmdSearchPatient = async (
  cmd: CommandInstance,
  args: Args,
  api: { patientApi: IccPatientXApi; userApi: IccUserXApi }
): Promise<void> => {
  cmd.log(
    JSON.stringify(
      (
        await api.patientApi.fuzzySearchWithUser(
          await api.userApi.getCurrentUser(),
          args.firstname,
          args.lastname
        )
      ).map((p: Patient) => ({ id: p.id, lastName: p.lastName, firstName: p.firstName }))
    )
  )
}
