import {
  cashieringPropertyHotelName,
  type CashieringDocumentProperty,
} from "@/packages/pms/lib/cashiering-document-property";
import { NoruMarkSvg } from "@/packages/pms/components/cashiering/folio-invoice-panel";

export function CashieringDocumentLetterhead({
  property,
  logoClassName = "size-10",
}: {
  property: CashieringDocumentProperty | null;
  logoClassName?: string;
}) {
  const hotelName = cashieringPropertyHotelName(property);
  const tin = property?.tinNumber?.trim();
  const vat = property?.vatNumber?.trim();
  const phone = property?.phone?.trim();
  const email = property?.email?.trim();
  const address = property?.fullAddress?.trim();

  return (
    <div className="space-y-1">
      <div className="mb-2 text-slate-900">
        {property?.logoUrl ? (
          <img
            src={property.logoUrl}
            alt=""
            className={`${logoClassName} max-h-12 w-auto rounded-lg object-contain object-left`}
          />
        ) : (
          <NoruMarkSvg className={`${logoClassName} text-slate-950`} strokeColor="#0a0a0a" />
        )}
      </div>
      <h2 className="text-base font-bold text-slate-950">{hotelName}</h2>
      {address ? <p className="text-xs text-slate-600">{address}</p> : null}
      {tin ? <p className="text-xs text-slate-600">TIN: {tin}</p> : null}
      {!tin && vat ? <p className="text-xs text-slate-600">VAT: {vat}</p> : null}
      {phone ? <p className="text-xs text-slate-600">Tel: {phone}</p> : null}
      {email ? <p className="text-xs text-slate-600">{email}</p> : null}
    </div>
  );
}
