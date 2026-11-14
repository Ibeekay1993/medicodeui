import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  TariffOption,
  itemUnitPrice,
  itemQuantity,
  itemTotal,
  hasValidItemQuantity,
  hasValidItemUnitPrice,
  parseNonNegativeAmount,
  parsePositiveQuantity,
} from "@/lib/clinicalUtils";
import { parsePrescriptionClientFallback } from "@/lib/prescriptionParser";
import { resolveParsedTariffPrices } from "@/lib/resolveParsedTariffPrices";
import {
  findExactActiveTariffMatch,
  findExactActiveTariffNameMatch,
  type SearchTariffResult,
} from "@/lib/exactActiveTariffMatch";

function normalizeStoredApprovalItem(item: any) {
  const parsedQuantity = parsePositiveQuantity(item.quantity);
  const quantity = parsedQuantity ?? 1;
  const recordedTotal = parseNonNegativeAmount(item.amount ?? item.price);
  const recordedUnitPrice = parseNonNegativeAmount(item.unit_price ?? item.unitPrice);
  const unitPrice = recordedUnitPrice ?? (
    recordedTotal !== null && parsedQuantity !== null
      ? recordedTotal / parsedQuantity
      : 0
  );
  const calculatedTotal = unitPrice * quantity;
  const roundedRecordedTotal = recordedTotal === null ? null : Math.round((recordedTotal + Number.EPSILON) * 100) / 100;
  const roundedCalculatedTotal = Math.round((calculatedTotal + Number.EPSILON) * 100) / 100;
  const amountMismatch = roundedRecordedTotal !== null && recordedUnitPrice !== null && parsedQuantity !== null
    && roundedRecordedTotal !== roundedCalculatedTotal;

  return {
    code: item.code,
    name: item.name,
    category: item.category,
    unitPrice,
    price: recordedTotal ?? calculatedTotal,
    quantity,
    quantityNeedsReview: false,
    // A stored item is price-confirmed when it was not explicitly flagged for
    // review AND it has a valid finite non-negative unit price with a consistent
    // total. Free services (unitPrice=0) are allowed. Only block when the price
    // is genuinely missing (null/NaN) or the stored amount is inconsistent.
    priceNeedsReview: item.price_requires_review === true || !Number.isFinite(unitPrice) || unitPrice < 0 || amountMismatch,
    frequency: item.frequency || null,
    duration: item.duration || null,
    matched_via: item.matched_via,
    confidence: item.confidence,
    declined: Boolean(item.declined),
    decline_reason: item.decline_reason || null,
  };
}

function normalizeTariffSearchResult(item: any) {
  const parsedQuantity = parsePositiveQuantity(item.quantity);
  const quantity = parsedQuantity ?? 1;
  const unitPrice = parseNonNegativeAmount(item.unit_price ?? item.unitPrice ?? item.amount ?? item.price);

  return {
    code: item.code,
    name: item.name,
    category: item.category,
    unitPrice: unitPrice ?? 0,
    price: (unitPrice ?? 0) * quantity,
    quantity,
    quantityNeedsReview: false,
    // Search results come directly from the active tariff catalog, so an
    // absent review marker is safe unless the returned price is invalid.
    priceNeedsReview: item.price_requires_review === true || unitPrice === null,
    frequency: item.frequency || null,
    duration: item.duration || null,
    matched_via: item.matched_via,
    matched_text: item.matched_text,
    confidence: item.confidence,
  };
}

function normalizeParsedApprovalItem(item: any) {
  const parsedQuantity = parsePositiveQuantity(item.quantity);
  const quantity = parsedQuantity ?? 1;
  const recordedTotal = parseNonNegativeAmount(item.amount ?? item.price);
  const recordedUnitPrice = parseNonNegativeAmount(item.unit_price ?? item.unitPrice);
  const unitPrice = recordedUnitPrice ?? (
    recordedTotal !== null && parsedQuantity !== null
      ? recordedTotal / parsedQuantity
      : null
  );
  const amountMismatch = recordedTotal !== null && recordedUnitPrice !== null && parsedQuantity !== null &&
    Math.round((recordedTotal + Number.EPSILON) * 100) / 100 !==
      Math.round((recordedUnitPrice * parsedQuantity + Number.EPSILON) * 100) / 100;

  return {
    code: item.code,
    name: item.name,
    category: item.category,
    price: recordedTotal ?? ((unitPrice ?? 0) * quantity),
    unitPrice: unitPrice ?? 0,
    quantity,
    quantityNeedsReview: false,
    // Flag for price review only when the parser explicitly says so, the
    // resolved price is invalid (not finite / negative), or the amount data is
    // internally inconsistent. Zero-price items (free services) are allowed.
    // Items with a valid positive price from the parser are treated as confirmed.
    priceNeedsReview: item.price_requires_review === true || !Number.isFinite(unitPrice ?? 0) || (unitPrice ?? 0) < 0 || amountMismatch,
    frequency: item.frequency || null,
    duration: item.duration || null,
    matched_via: item.matched_via,
    matched_text: item.matched_text,
    confidence: item.confidence,
  };
}

export function useTariffSearch(
  open: boolean,
  editTreatment: string,
  request: any,
  shouldAutoDetectFromSource: boolean
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
        ? request.approved_items.map(normalizeStoredApprovalItem)
        : [];
      setApprovedItems(parsedItems);
      setEditingQuantities({});
      setTariffSearch("");
      setTariffOptions([]);
      setParseStatus("");
      setCartCollapsed(parsedItems.length === 0);
      lastParsedTextRef.current = "";
    }
  }, [open, request]);

  useEffect(() => {
    if (approvedItems.length === 0 && !parseStatus) {
      // Keep the cart open when there is treatment text to review or search.
      // Otherwise an empty hospital-submitted request looked as though its
      // treatment items had failed to load, while all controls were hidden.
      setCartCollapsed(!editTreatment.trim());
    }
  }, [approvedItems.length, parseStatus, editTreatment]);

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
        let parsed: TariffOption[] = [];

        // 1. First attempt parsing via backend Edge Function
        try {
          const { data, error } = await supabase.functions.invoke("parse-request-text", {
            body: { text },
          });
          if (error) throw error;
          if (data && data.error) throw new Error(data.message || "Parse failed");

          if (Array.isArray(data?.items)) {
            parsed = (data.items as any[]).map(normalizeParsedApprovalItem);
          }
        } catch (edgeErr) {
          console.warn("parse-request-text Edge Function call failed or rejected, falling back to client parser:", edgeErr);
        }

        // 2. Resilient fallback: If Edge Function returned 0 items or failed, run client-side parser against nhia_items
        if (parsed.length === 0) {
          try {
            const clientParsed = await parsePrescriptionClientFallback(text, supabase);
            if (clientParsed.length > 0) {
              parsed = clientParsed;
            }
          } catch (fallbackErr) {
            console.error("Client prescription parse fallback error:", fallbackErr);
          }
        }

        let tariffLookupFailed = false;
        if (parsed.length > 0) {
          const codes = Array.from(new Set(parsed.map((item) => String(item.code || "").trim().toUpperCase()).filter(Boolean)));
          const activeTariffs: Array<{
            code: string | null;
            name: string | null;
            category: string | null;
            amount: unknown;
          }> = [];
          try {
            const { data, error } = await (supabase as any)
              .from("nhia_items")
              .select("code,name,category,amount")
              .in("code", codes)
              .eq("is_active", true);
            if (error) throw error;
            activeTariffs.push(...((data || []) as typeof activeTariffs));
          } catch (catalogErr) {
            console.warn("Direct active NHIA catalogue lookup failed; retrying missing codes through the catalogue search function:", catalogErr);
          }

          // Some authenticated sessions can invoke the catalog search function
          // while direct table reads return no rows. Retry only missing codes
          // through that service-backed search and accept exact code matches.
          const foundCodes = new Set(activeTariffs.map((tariff) => String(tariff.code || "").trim().toUpperCase()));
          const missingCodes = codes.filter((code) => !foundCodes.has(code));
          const parsedByCode = new Map(parsed.map((item) => [String(item.code || "").trim().toUpperCase(), item]));
          const catalogCodeAliases = new Map<string, string>();
          const lookupResults = await Promise.all(missingCodes.map(async (code) => {
            try {
              const item = parsedByCode.get(code);
              const findCatalogResult = async (query: string) => {
                const { data, error } = await supabase.functions.invoke("search-nhia", { body: { query } });
                if (error || data?.success !== true || !Array.isArray(data.results)) return null;
                const results = data.results as SearchTariffResult[];
                return findExactActiveTariffMatch(code, results) || (item
                  ? findExactActiveTariffNameMatch(item.name, item.category, results)
                  : null);
              };
              const match = await findCatalogResult(code) || (item ? await findCatalogResult(item.name) : null);
              if (!match) return null;
              return {
                requestedCode: code,
                code: String(match.code),
                name: typeof match.name === "string" ? match.name : null,
                category: typeof match.category === "string" ? match.category : null,
                amount: match.amount,
              };
            } catch (lookupError) {
              console.warn("Exact NHIA tariff code lookup failed:", code, lookupError);
              return null;
            }
          }));
          for (const result of lookupResults) {
            if (result) {
              activeTariffs.push(result);
              if (result.code) catalogCodeAliases.set(result.requestedCode, result.code);
            }
          }
          const recoveredCodes = new Set(activeTariffs.flatMap((tariff) => {
            const code = String(tariff.code || "").trim().toUpperCase();
            return [code, ...Array.from(catalogCodeAliases.entries()).filter(([, target]) => target.toUpperCase() === code).map(([source]) => source)];
          }));
          tariffLookupFailed = codes.some((code) => !recoveredCodes.has(code));
          parsed = parsed.map((item) => {
            const alias = catalogCodeAliases.get(String(item.code || "").trim().toUpperCase());
            return alias ? { ...item, code: alias, matched_via: "catalog_exact_name" } : item;
          });
          parsed = resolveParsedTariffPrices(parsed, activeTariffs);
        }

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
        const hasUnverifiedPrice = parsed.some((item) => item.priceNeedsReview === true);
        setParseStatus(
          parsed.length && (tariffLookupFailed || hasUnverifiedPrice)
            ? `${parsed.length} item${parsed.length === 1 ? "" : "s"} detected, but one or more prices could not be confirmed from the active NHIA catalogue. Approval stays blocked until resolved.`
            : parsed.length
            ? `${parsed.length} item${parsed.length === 1 ? "" : "s"} detected and priced from the active NHIA catalogue.`
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

  // Auto-detect prescription parsing — only for fresh requests that have no saved approved items yet.
  useEffect(() => {
    if (!open || !editTreatment.trim() || !shouldAutoDetectFromSource) return;
    if (request?.deletion_status === "awaiting_admin_approval") return;

    // ✅ Key guard: if the request already has saved approved_items (from a previous review/approval),
    // do NOT re-run auto-detect. The DB data is the source of truth — re-parsing would overwrite
    // deliberate clinical decisions made during the original approval.
    if (Array.isArray(request?.approved_items) && request.approved_items.length > 0) return;

    const text = editTreatment.trim();
    if (text === lastParsedTextRef.current) return;

    const timer = setTimeout(() => {
      void parseTreatmentText({ replaceAuto: false, quiet: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [open, editTreatment, request, shouldAutoDetectFromSource, parseTreatmentText]);

  // Catalog search
  useEffect(() => {
    if (!open) return;
    const query = tariffSearch.trim();
    if (query.length < 2) {
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
          ((data?.results || []) as any[]).map(normalizeTariffSearchResult)
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
              price: parseNonNegativeAmount(item.amount) ?? 0,
              unitPrice: parseNonNegativeAmount(item.amount) ?? 0,
              quantity: 1,
              quantityNeedsReview: false,
              priceNeedsReview: parseNonNegativeAmount(item.amount) === null,
            }))
          );
        } catch (nhiaErr) {
          console.error("nhia_items fallback query failed:", nhiaErr);
          toast({
            variant: "destructive",
            title: "NHIA tariff catalogue unavailable",
            description: "Could not retrieve matching active NHIA catalogue items. Search again when the catalogue connection is restored.",
          });
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
      return [...current, {
        ...item,
        unitPrice,
        quantity,
        price: unitPrice * quantity,
        quantityNeedsReview: !hasValidItemQuantity(item),
        priceNeedsReview: item.priceNeedsReview === true || !hasValidItemUnitPrice(item),
        matched_via: "manual",
      }];
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
    const key = code || "";
    if (!Object.prototype.hasOwnProperty.call(editingQuantities, key)) return;

    const raw = editingQuantities[key];
    const parsed = parsePositiveQuantity(raw);
    setEditingQuantities((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // Blank or invalid drafts are cancelled: preserve the last valid amount.
    if (parsed === null) return;

    setApprovedItems((current) => current.map((item) => {
      if (item.code !== code) return item;
      const unit = itemUnitPrice(item);
      return {
        ...item,
        unitPrice: unit,
        quantity: parsed,
        quantityNeedsReview: false,
        price: unit * parsed,
      };
    }));
  };

  const changeItemQuantity = (code: string | null, newQuantity: number) => {
    const quantity = Math.max(1, Math.floor(newQuantity));
    setEditingQuantities((prev) => {
      const next = { ...prev };
      delete next[code || ""];
      return next;
    });
    setApprovedItems((current) =>
      current.map((item) => {
        if (item.code !== code) return item;
        const unit = itemUnitPrice(item);
        return {
          ...item,
          unitPrice: unit,
          quantity,
          quantityNeedsReview: false,
          price: unit * quantity,
        };
      })
    );
  };

  const confirmItemQuantity = (code: string | null) => {
    setApprovedItems((current) => current.map((item) => {
      if (item.code !== code || !hasValidItemQuantity(item)) return item;
      return { ...item, quantityNeedsReview: false };
    }));
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
    changeItemQuantity,
    confirmItemQuantity,
    parseTreatmentText,
  };
}
