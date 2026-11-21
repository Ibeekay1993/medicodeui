import { useState, useEffect, useCallback } from "react";
import { useTariffSearch } from "./useTariffSearch";

export interface UseTreatmentCartProps {
  open: boolean;
  request: any;
  canManageClinicalCart: boolean;
  isHospitalDirected: boolean;
  recoveredTreatment?: string;
}

export function useTreatmentCart({
  open,
  request,
  canManageClinicalCart,
  isHospitalDirected,
  recoveredTreatment,
}: UseTreatmentCartProps) {
  const [editTreatment, setEditTreatment] = useState("");

  // Sync with recovered treatment from WhatsApp recovery if provided
  useEffect(() => {
    if (recoveredTreatment) {
      setEditTreatment(recoveredTreatment);
    }
  }, [recoveredTreatment]);

  // Reset or initialize on request change
  useEffect(() => {
    if (!open || !request) {
      setEditTreatment("");
    }
  }, [open, request?.id]);

  // Call the underlying tariff search engine
  const tariffSearch = useTariffSearch(
    open,
    editTreatment,
    request,
    canManageClinicalCart && !isHospitalDirected
  );

  const handleBlurParseTreatment = useCallback(() => {
    if (!canManageClinicalCart) return;
    void tariffSearch.parseTreatmentText({ replaceAuto: true, quiet: true });
  }, [canManageClinicalCart, tariffSearch]);

  return {
    editTreatment,
    setEditTreatment,
    tariffSearch,
    handleBlurParseTreatment,
    approvedItems: tariffSearch.approvedItems,
    approvedTotal: tariffSearch.approvedTotal,
  };
}
