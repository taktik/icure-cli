import {
	IccContactXApi,
	IccCryptoXApi,
	IccHcpartyXApi,
	IccPatientXApi,
	IccHelementXApi,
	iccPatientApi,
	IccUserXApi,
	IccInvoiceXApi,
	IccDocumentXApi,
	IccClassificationXApi,
	iccEntityrefApi,
	UserDto,
	iccBeKmehrApi,
	IccFormXApi,
	IccCalendarItemXApi, IccTimeTableXApi, iccAuthApi, iccContactApi
} from 'icc-api'
import fetch from 'node-fetch'
import * as WebCrypto from 'node-webcrypto-ossl'

export class Api {
	private _entityreficc: iccEntityrefApi
	private _usericc: IccUserXApi
	private _hcpartyicc: IccHcpartyXApi
	private _cryptoicc: IccCryptoXApi
	private _contacticc: IccContactXApi
	private _formicc: IccFormXApi
	private _helementicc: IccHelementXApi
	private _invoiceicc: IccInvoiceXApi
	private _documenticc: IccDocumentXApi
	private _classificationicc: IccClassificationXApi
	private _calendaritemicc: IccCalendarItemXApi
	private _timetableicc: IccTimeTableXApi
	private _bekmehricc: iccBeKmehrApi
	private _patienticc: IccPatientXApi

	private _currentUser: UserDto | null
	private _rawContacticc: iccContactApi

	constructor(host: string,
				headers: { [key: string]: string },
				fetchImpl: (input: RequestInfo, init?: RequestInit) => Promise<Response>
	) {
		this._currentUser = null

		const authicc = new iccAuthApi(host, headers, fetchImpl)

		this._entityreficc = new iccEntityrefApi(host, headers, fetchImpl)
		this._usericc = new IccUserXApi(host, headers, fetchImpl)
		this._hcpartyicc = new IccHcpartyXApi(host, headers, fetchImpl)
		this._cryptoicc = new IccCryptoXApi(host, headers, this._hcpartyicc, new iccPatientApi(host, headers, fetchImpl), new WebCrypto())
		this._contacticc = new IccContactXApi(host, headers, this._cryptoicc, fetchImpl)
		this._formicc = new IccFormXApi(host, headers, this._cryptoicc, fetchImpl)
		this._invoiceicc = new IccInvoiceXApi(host, headers, this._cryptoicc, this._entityreficc, fetchImpl)
		this._documenticc = new IccDocumentXApi(host, headers, this._cryptoicc, authicc, fetchImpl)
		this._helementicc = new IccHelementXApi(host, headers, this._cryptoicc, fetchImpl)
		this._classificationicc = new IccClassificationXApi(host, headers, this._cryptoicc, fetchImpl)
		this._timetableicc = new IccTimeTableXApi(host, headers, this._cryptoicc, fetchImpl)
		this._calendaritemicc = new IccCalendarItemXApi(host, headers, this._cryptoicc, fetchImpl)
		this._bekmehricc = new iccBeKmehrApi(host, headers, fetchImpl)
		this._patienticc = new IccPatientXApi(host, headers, this._cryptoicc, this._contacticc, this._formicc, this._helementicc, this._invoiceicc, this._documenticc, this._hcpartyicc, this._classificationicc, this._calendaritemicc,['note'], fetchImpl)

		this._rawContacticc = new iccContactApi(host, headers, fetchImpl)

		this._usericc.getCurrentUser().then((u: UserDto) => this._currentUser = u)
	}

	get hcpartyicc(): IccHcpartyXApi {
		return this._hcpartyicc
	}

	get patienticc(): IccPatientXApi {
		return this._patienticc
	}

	get cryptoicc(): IccCryptoXApi {
		return this._cryptoicc
	}

	get contacticc(): IccContactXApi {
		return this._contacticc
	}

	get formicc(): IccFormXApi {
		return this._formicc
	}

	get helementicc(): IccHelementXApi {
		return this._helementicc
	}

	get usericc(): IccUserXApi {
		return this._usericc
	}

	get invoiceicc(): IccInvoiceXApi {
		return this._invoiceicc
	}

	get documenticc(): IccDocumentXApi {
		return this._documenticc
	}

	get bekmehricc(): iccBeKmehrApi {
		return this._bekmehricc
	}

	get classificationicc(): IccClassificationXApi {
		return this._classificationicc
	}

	get entityreficc(): iccEntityrefApi {
		return this._entityreficc
	}

	get calendaritemicc(): IccCalendarItemXApi {
		return this._calendaritemicc
	}

	get timetableicc(): IccTimeTableXApi {
		return this._timetableicc
	}

	get currentUser(): UserDto | null {
		return this._currentUser
	}

	get rawContacticc(): iccContactApi {
		return this._rawContacticc
	}
}
