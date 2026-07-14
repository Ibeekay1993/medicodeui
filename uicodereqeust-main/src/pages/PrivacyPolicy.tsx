import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
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

          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-slate-500 text-sm font-semibold uppercase tracking-widest mb-10 border-b border-slate-100 pb-6">
            Last Updated: July 2026
          </p>

          <div className="prose prose-slate max-w-none text-slate-600 space-y-6">
            <p>
              At <strong>Ronsberger HMO</strong>, we take your privacy and the security of your healthcare data seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our portal and use our services.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">1. Information We Collect</h2>
            <p>
              We may collect information about you in a variety of ways. The information we may collect includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, and telephone number.</li>
              <li><strong>Healthcare Data:</strong> Information related to patient clinical pre-authorizations, NHIA records, and claims management.</li>
              <li><strong>Derivative Data:</strong> Information our servers automatically collect when you access the portal, such as your IP address, browser type, and access times.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">2. Use of Your Information</h2>
            <p>
              Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Create and manage your account.</li>
              <li>Process healthcare authorizations and claims in compliance with NHIA guidelines.</li>
              <li>Improve portal security and prevent fraudulent transactions.</li>
              <li>Send administrative information, such as updates to our terms and policies.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">3. GDPR & NDPR Compliance</h2>
            <p>
              If you are a resident of the European Economic Area (EEA) or Nigeria, you have certain data protection rights under GDPR and NDPR. Ronsberger HMO aims to take reasonable steps to allow you to correct, amend, delete, or limit the use of your Personal Data.
            </p>
            <p>
              If you wish to be informed what Personal Data we hold about you and if you want it to be removed from our systems, please contact our Data Protection Officer.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">4. Cookies and Tracking</h2>
            <p>
              We use cookies to help customize the Portal and improve your experience. Most browsers are set to accept cookies by default. You can remove or reject cookies, but be aware that such action could affect the availability and functionality of the Portal. For more details, review our Cookie Preferences.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">5. Contact Us</h2>
            <p>
              If you have questions or comments about this Privacy Policy, please contact us at:
              <br />
              <strong>Email:</strong> compliance@ronsberger.com
              <br />
              <strong>Phone:</strong> +234 (0) 800 000 0000
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
