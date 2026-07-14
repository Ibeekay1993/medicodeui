import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-8 sm:p-12">
          <Button variant="ghost" asChild className="mb-8 -ml-4 text-slate-500 hover:text-slate-900">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Link>
          </Button>

          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2">Terms of Service</h1>
          <p className="text-slate-500 text-sm font-semibold uppercase tracking-widest mb-10 border-b border-slate-100 pb-6">
            Last Updated: July 2026
          </p>

          <div className="prose prose-slate max-w-none text-slate-600 space-y-6">
            <p>
              Welcome to the <strong>Ronsberger HMO Portal</strong>. By accessing or using our platform, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">1. Access and Registration</h2>
            <p>
              To access the portal, you must be a registered healthcare provider or an authorized representative of a hospital. You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">2. Authorized Use of Data</h2>
            <p>
              This portal handles highly sensitive personal healthcare data. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use patient data solely for the purpose of pre-authorizations and claims processing.</li>
              <li>Comply with all applicable data protection laws, including GDPR, NDPR, and NHIA guidelines.</li>
              <li>Not extract, scrape, or mass-download data outside the bounds of authorized API usage.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">3. Accuracy of Claims and Authorizations</h2>
            <p>
              You represent and warrant that any information, codes (e.g., ICD-10, tariffs), and claims you submit via the portal are accurate, complete, and legally valid. Ronsberger HMO is not liable for rejected claims resulting from inaccurate data entry.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">4. Termination</h2>
            <p>
              We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">5. Limitation of Liability</h2>
            <p>
              In no event shall Ronsberger HMO, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">6. Changes to Terms</h2>
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">7. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please contact us at compliance@ronsberger.com.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
