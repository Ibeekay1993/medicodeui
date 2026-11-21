import React from "react";
import { BrandSpinner } from "@/components/BrandSpinner";
import { TreatmentCart } from "./TreatmentCart";

interface TreatmentCartSectionProps {
  request: any;
  requestDetailsLoaded: boolean;
  isHospitalDirected: boolean;
  isLocked: boolean;
  isDeletionLocked: boolean;
  treatmentCart: {
    editTreatment: string;
    setEditTreatment: (value: string) => void;
    tariffSearch: any;
  };
}

export const TreatmentCartSection = React.memo(function TreatmentCartSection({
  request,
  requestDetailsLoaded,
  isHospitalDirected,
  isLocked,
  isDeletionLocked,
  treatmentCart,
}: TreatmentCartSectionProps) {
  const readOnly = !requestDetailsLoaded || isHospitalDirected || isLocked || isDeletionLocked;

  return (
    <div className="bg-white rounded-[1.2rem] sm:rounded-[1.5rem] border border-slate-100 shadow-sm p-4 sm:p-5 relative overflow-hidden group mb-3">
      {requestDetailsLoaded ? (
        <TreatmentCart
          request={request}
          approvedItems={treatmentCart.tariffSearch.approvedItems}
          removeApprovedItem={treatmentCart.tariffSearch.removeApprovedItem}
          approvedTotal={treatmentCart.tariffSearch.approvedTotal}
          totalApprovedAmount={treatmentCart.tariffSearch.approvedTotal}
          changeItemQuantity={treatmentCart.tariffSearch.changeItemQuantity}
          confirmItemQuantity={treatmentCart.tariffSearch.confirmItemQuantity}
          isHospitalDirected={isHospitalDirected}
          editTreatment={treatmentCart.editTreatment}
          setEditTreatment={treatmentCart.setEditTreatment}
          updateDeclineReason={treatmentCart.tariffSearch.updateDeclineReason}
          tariffSearch={treatmentCart.tariffSearch.tariffSearch}
          setTariffSearch={treatmentCart.tariffSearch.setTariffSearch}
          tariffOptions={treatmentCart.tariffSearch.tariffOptions}
          setTariffOptions={treatmentCart.tariffSearch.setTariffOptions}
          tariffSearchLoading={treatmentCart.tariffSearch.tariffSearchLoading}
          parseLoading={treatmentCart.tariffSearch.parseLoading}
          parseStatus={treatmentCart.tariffSearch.parseStatus}
          parseTreatmentText={treatmentCart.tariffSearch.parseTreatmentText}
          editingQuantities={treatmentCart.tariffSearch.editingQuantities}
          updateApprovedItemQuantity={treatmentCart.tariffSearch.updateApprovedItemQuantity}
          commitQuantity={treatmentCart.tariffSearch.commitQuantity}
          toggleDeclineApprovedItem={treatmentCart.tariffSearch.toggleDeclineApprovedItem}
          addApprovedItem={treatmentCart.tariffSearch.addApprovedItem}
          cartCollapsed={treatmentCart.tariffSearch.cartCollapsed}
          setCartCollapsed={treatmentCart.tariffSearch.setCartCollapsed}
          readOnly={readOnly}
        />
      ) : (
        <div
          role="status"
          className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-xs font-medium text-slate-600"
        >
          <BrandSpinner className="h-4 w-4 animate-spin text-slate-500" />
          Loading diagnosis, treatment and saved clinical items…
        </div>
      )}
    </div>
  );
});
