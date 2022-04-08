import { Contact, IccCryptoXApi } from '@icure/api'

export async function contactsToPatientIds(
  api: { cryptoApi: IccCryptoXApi },
  hcpartyId: string,
  contacts: Contact[]
): Promise<string[]> {
  try {
    const extractPromises = contacts.map((ctc: Contact) => {
      return api.cryptoApi
        .extractKeysFromDelegationsForHcpHierarchy(
          hcpartyId,
          ctc.id || '',
          ctc.cryptedForeignKeys || {}
        )
        .catch(() => ({ extractedKeys: [] }))
    })
    const extracted = await Promise.all(extractPromises)
    return [...new Set(extracted.flatMap((it) => it.extractedKeys))]
  } catch (error) {
    console.error('Error while converting contacts to patient ids')
    console.error(error)
    return Promise.reject()
  }
}

export const chunk = <T>(input: T[], size: number): T[][] =>
  input.reduce(
    (arr, item: T, idx) =>
      idx % size === 0 ? [...arr, [item]] : [...arr.slice(0, -1), [...arr.slice(-1)[0], item]],
    [] as T[][]
  )

export const uniqWith = <T>(arr: T[], fn: (a: T, b: T) => boolean) =>
  arr.filter((element, index) => arr.findIndex((step) => fn(element, step)) === index)
