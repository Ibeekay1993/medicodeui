import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  TariffOption,
  itemUnitPrice,
  itemQuantity,
  itemTotal,
} from "@/lib/clinicalUtils";

export function useTariffSearch(
  open: boolean,
  editTreatment: string,
  request: any,
  isHospitalDirected: boolean
) {
  const { toast } = useToast();
  const [tariffSearch, setTariffSearch] = useState("");
  const [tariffOptions, setTariffOptions] = useState<TariffOption[]>([]);
  const [tariffSearchLoading, setTariffSearchLoading] = useState(false);
  const [approvedItems, setApprovedItems] = useState<TariffOption[]>([]);
  const [editingQuantities, setEditingQuantities] = useState<Record<string, string>>({});
  const [parseLoading, setParseLoading] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [cartCollapsed, setCartCollapsed] = useState(true);
  const lastParsedTextRef = useRef("");

  // Populate initial approved items from request
  useEffect(() => {
    if (open && request) {
      const parsedItems = Array.isArray(request.approved_items)
        ? request.approved_items.map((item: any) => ({
            code: item.code,
            name: item.name,
            category: item.category,
            price: Number(item.amount || item.price || 0),
            unitPrice: Number(item.unit_price || item.unitPrice || item.price || item.amount || 0),
            quantity: Number(item.quantity || 1),
            frequency: item.frequency || null,
            duration: item.duration || null,
            matched_via: item.matched_via,
            confidence: item.confidence,
            declined: Boolean(item.declined),
            decline_reason: item.decline_reason || null,
          }))
        : [];
      setApprovedItems(parsedItems);
      setTariffSearch("");
      setTariffOptions([]);
      setParseStatus("");
      setCartCollapsed(parsedItems.length === 0);
      lastParsedTextRef.current = "";
    }
  }, [open, request]);

  useEffect(() => {
    if (approvedItems.length === 0 && !parseStatus) {
      setCartCollapsed(true);
    }
  }, [approvedItems.length, parseStatus]);

  const normalizeParseText = (value: string) =>
    value
      .replace(/\r/g, "")
      .replace(/[\*•]/g, "")
      .split("\n")
      .map((line) => line.replace(/^[\s\-–—•]+/, "").trim())
      .filter(Boolean)
      .join("\n");

  const parseTreatmentText = useCallback(
    async (options?: { force?: boolean; replaceAuto?: boolean; quiet?: boolean }) => {
      const text = normalizeParseText(editTreatment);
      if (!text) return;
      if (!options?.force && lastParsedTextRef.current === text) return;
      lastParsedTextRef.current = text;
      setParseLoading(true);
      setParseStatus("Analyzing prescription...");

      try {
        const { data, error } = await supabase.functions.invoke("parse-request-text", {
          body: { text },
        });
        if (error) throw error;
        const parsed = ((data?.items || []) as any[]).map((item) => ({
          code: item.code,
          name: item.name,
          category: item.category,
          price: Number(item.amount || item.price || 0),
          unitPrice: Number(item.unit_price || item.amount || item.price || 0),
          quantity: Number(item.quantity || 1),
          frequency: item.frequency || null,
          duration: item.duration || null,
          matched_via: item.matched_via,
          matched_text: item.matched_text,
          confidence: item.confidence,
        }));

        setApprovedItems((current) => {
          const retained = options?.replaceAuto
            ? current.filter((item) => item.matched_via === "manual")
            : current;
          const seen = new Set(retained.map((item) => item.code));
          return [...retained, ...parsed.filter((item) => item.code && !seen.has(item.code))];
        });
        if (parsed.length > 0) {
          setCartCollapsed(false);
        }
        setParseStatus(
          parsed.length
            ? `${parsed.length} item${parsed.length === 1 ? "" : "s"} detected automatically.`
            : "No NHIA match detected yet. Search and add manually if needed."
        );
      } catch (err) {
        console.error("Treatment parse failed:", err);
        setParseStatus("Auto-detect could not complete. Try manual search or rerun.");
        if (!options?.quiet) {
          toast({
            variant: "destructive",
            title: "Auto-detect failed",
            description: err instanceof Error ? err.message : "Unable to detect NHIA items from the treatment text.",
          });
        }
      } finally {
        setParseLoading(false);
      }
    },
    [editTreatment, toast]
  );

  // Auto-detect prescription parsing
  useEffect(() => {
    if (!open || !editTreatment.trim() || isHospitalDirected) return;
    if (request?.deletion_status === "awaiting_admin_approval") return;
    const text = editTreatment.trim();
    if (text === lastParsedTextRef.current) return;

    const timer = setTimeout(() => {
      void parseTreatmentText({ replaceAuto: false, quiet: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [open, editTreatment, request, isHospitalDirected, parseTreatmentText]);

  // Catalog search
  useEffect(() => {
    if (!open) return;
    const query = tariffSearch.trim();
    if (query.length < 3) {
      setTariffOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setTariffSearchLoading(true);

      try {
        const { data, error } = await supabase.functions.invoke("search-nhia", {
          body: { query },
        });

        if (error) throw error;
        if (data && data.error) throw new Error(data.message || "Search failed");
        setTariffOptions(
          ((data?.results || []) as any[]).map((item) => ({
            code: item.code,
            name: item.name,
            category: item.category,
            price: Number(item.amount || item.price || 0),
            unitPrice: Number(item.unit_price || item.amount || item.price || 0),
            quantity: Number(item.quantity || 1),
            frequency: item.frequency || null,
            duration: item.duration || null,
            matched_via: item.matched_via,
            confidence: item.confidence,
          }))
        );
      } catch (err) {
        console.error("Tariff search via function failed, trying database fallback:", err);
        try {
          const escaped = query.replace(/[%_,]/g, " ");
          const { data, error: nhiaError } = await supabase
            .from("nhia_items" as any)
            .select("code,name,category,amount")
            .or(`code.ilike.%${escaped}%,name.ilike.%${escaped}%,subcategory.ilike.%${escaped}%`)
            .eq("is_active", true)
            .limit(100);

          if (nhiaError) throw nhiaError;

          setTariffOptions(
            ((data || []) as any[]).map((item) => ({
              code: item.code,
              name: item.name,
              category: item.category,
              price: Number(item.amount || 0),
              unitPrice: Number(item.amount || 0),
              quantity: 1,
            }))
          );
        } catch (nhiaErr) {
          console.error("nhia_items fallback query failed:", nhiaErr);
          try {
            const escaped = query.replace(/[%_,]/g, " ");
            const { data, error: tariffError } = await supabase
              .from("clinical_tariffs" as any)
              .select("code,name,category,price")
              .or(`code.ilike.%${escaped}%,name.ilike.%${escaped}%`)
              .limit(100);

            if (tariffError) throw tariffError;

            setTariffOptions(
              ((data || []) as any[]).map((item) => ({
                code: item.code,
                name: item.name,
                category: item.category,
                price: Number(item.price || 0),
                unitPrice: Number(item.price || 0),
                quantity: 1,
              }))
            );
          } catch (tariffErr) {
            console.error("clinical_tariffs fallback query failed:", tariffErr);
            toast({
              variant: "destructive",
              title: "Search Failed",
              description: "Could not retrieve matching catalog items from the database.",
            });
          }
        }
      } finally {
        setTariffSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [open, tariffSearch, toast]);

  const approvedTotal = approvedItems.reduce((sum, item) => sum + itemTotal(item), 0);

  const addApprovedItem = (item: TariffOption) => {
    if (!item.code) return;
    setApprovedItems((current) => {
      if (current.some((existing) => existing.code === item.code)) return current;
      const unitPrice = itemUnitPrice(item);
      const quantity = itemQuantity(item);
      return [...current, { ...item, unitPrice, quantity, price: unitPrice * quantity, matched_via: "manual" }];
    });
    setCartCollapsed(false);
  };

  const removeApprovedItem = (code: string | null) => {
    setApprovedItems((current) => current.filter((item) => item.code !== code));
  };

  const toggleDeclineApprovedItem = (code: string | null) => {
    setApprovedItems((current) =>
      current.map((item) =>
        item.code === code ? { ...item, declined: !item.declined } : item
      )
    );
  };

  const updateApprovedItemQuantity = (code: string | null, value: string) => {
    const cleaned = String(value || "").replace(/[^0-9]/g, "");
    setEditingQuantities((prev) => ({ ...prev, [code || ""]: cleaned }));
  };

  const commitQuantity = (code: string | null) => {
    const raw = editingQuantities[code || ""] ?? "";
    const parsed = Number(raw);
    const quantity = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
    setEditingQuantities((prev) => {
      const next = { ...prev };
      delete next[code || ""];
      return next;
    });
    setApprovedItems((current) =>
      current.map((item) =>
        item.code === code ? { ...item, quantity, price: itemUnitPrice(item) * quantity } : item
      )
    );
  };

  const updateDeclineReason = (code: string | null, reason: string) => {
    setApprovedItems((current) =>
      current.map((item) =>
        item.code === code ? { ...item, decline_reason: reason } : item
      )
    );
  };

  return {
    tariffSearch,
    setTariffSearch,
    tariffOptions,
    setTariffOptions,
    tariffSearchLoading,
    approvedItems,
    setApprovedItems,
    editingQuantities,
    parseLoading,
    parseStatus,
    cartCollapsed,
    setCartCollapsed,
    approvedTotal,
    addApprovedItem,
    removeApprovedItem,
    toggleDeclineApprovedItem,
    updateDeclineReason,
    updateApprovedItemQuantity,
    commitQuantity,
    parseTreatmentText,
  };
}
