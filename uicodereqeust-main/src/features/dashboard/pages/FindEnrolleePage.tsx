import { useEffect, useState } from "react";
import { AlertCircle, BadgeCheck, Search, UserRound, Users } from "lucide-react";
import { BrandSpinner } from "@/components/BrandSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { normalizeEnrolleeSearchTerm } from "@/lib/enrolleeSearch";

interface EnrolleeRecord {
  full_name: string;
  policy_number: string;
  beneficiary_number: string | null;
  member_type: string | null;
  plan_code: string | null;
}

export default function FindEnrolleePage() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<EnrolleeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrySequence, setRetrySequence] = useState(0);
  const term = normalizeEnrolleeSearchTerm(search);

  useEffect(() => {
    if (term.length < 3) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    setResults([]);
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from("nhis_beneficiaries")
        .select("full_name,policy_number,beneficiary_number,member_type,plan_code")
        .or(`full_name.ilike.%${term}%,policy_number.ilike.%${term}%,beneficiary_number.eq.${term}`)
        .order("full_name", { ascending: true })
        .limit(30)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (searchError) {
        setResults([]);
        setError("The enrollee search could not be completed. Check your connection and retry.");
      } else {
        setResults((data || []) as EnrolleeRecord[]);
      }
      setLoading(false);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [term, retrySequence]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4" aria-labelledby="find-enrollee-title">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 id="find-enrollee-title" className="text-lg font-bold text-slate-950">Find Enrollee</h1>
            <p className="mt-1 text-sm text-slate-600">Confirm a person’s active NHIS beneficiary record by name, policy, or beneficiary number.</p>
          </div>
        </div>

        <div className="mt-4 max-w-2xl">
          <label htmlFor="enrollee-search" className="mb-1.5 block text-sm font-semibold text-slate-800">Search the beneficiary register</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <Input
              id="enrollee-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, policy number, or beneficiary number"
              className="h-11 pl-9 pr-10"
              autoComplete="off"
              aria-describedby="enrollee-search-help"
            />
            {loading && <BrandSpinner className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2" />}
          </div>
          <p id="enrollee-search-help" className="mt-1.5 text-xs text-slate-600">Enter at least 3 letters or digits. Search results show the beneficiary and their family policy.</p>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-white p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setRetrySequence((value) => value + 1)}>Retry</Button>
        </div>
      )}

      {term.length < 3 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Search className="mx-auto h-6 w-6 text-slate-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-slate-800">Search the enrollee register</p>
          <p className="mt-1 text-sm text-slate-600">Matching beneficiaries will appear here.</p>
        </div>
      ) : loading ? (
        <div className="flex min-h-36 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700" role="status" aria-live="polite">
          <BrandSpinner className="h-5 w-5" /> Searching the beneficiary register…
        </div>
      ) : !error && results.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <UserRound className="mx-auto h-6 w-6 text-slate-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-slate-800">No matching enrollee found</p>
          <p className="mt-1 text-sm text-slate-600">Check the spelling or number and search again.</p>
        </div>
      ) : results.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Matching beneficiaries</h2>
            <span className="text-xs font-medium text-slate-600">Up to 30 results</span>
          </div>
          <ul className="divide-y divide-slate-100" aria-label="Enrollee search results">
            {results.map((record, index) => (
              <li key={`${record.policy_number}:${record.beneficiary_number || record.full_name}:${index}`} className="flex min-w-0 items-start gap-3 px-4 py-3.5">
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-950 [overflow-wrap:anywhere]">{record.full_name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                    <span><span className="font-medium text-slate-500">Beneficiary ID:</span> <span className="font-mono font-semibold">{record.beneficiary_number || "Not recorded"}</span></span>
                    <span><span className="font-medium text-slate-500">Family policy:</span> <span className="font-mono font-semibold">{record.policy_number}</span></span>
                    {record.member_type && <span className="capitalize"><span className="font-medium text-slate-500">Member:</span> {record.member_type}</span>}
                    {record.plan_code && <span><span className="font-medium text-slate-500">Plan:</span> {record.plan_code}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
