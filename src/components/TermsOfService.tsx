import React from 'react';
import { ArrowLeft, FileText } from 'lucide-react';

interface TermsOfServiceProps {
  onBack: () => void;
}

const TermsOfService: React.FC<TermsOfServiceProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 bg-white text-slate-100 dark:text-slate-100 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/80 dark:bg-slate-950/80 bg-white/80 border-b border-slate-800 dark:border-slate-800 border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 dark:text-slate-400 text-gray-600 hover:text-white dark:hover:text-white hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500 dark:text-indigo-500 text-indigo-600" />
            <h1 className="text-xl font-semibold text-white dark:text-white text-gray-900">Terms of Service</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto py-8 px-6">
        <div className="prose prose-invert dark:prose-invert max-w-none">
          {/* Title */}
          <h1 className="text-3xl font-bold mb-2 text-white dark:text-white text-gray-900">TERMS OF SERVICE</h1>
          <p className="text-slate-400 dark:text-slate-400 text-gray-600 mb-8">Last updated January 18, 2026</p>

          {/* Main Content */}
          <div className="space-y-6 text-slate-300 dark:text-slate-300 text-gray-700 leading-relaxed">
            <p>
              These Terms of Service ("Terms") govern your access to and use of PrepSuite ("Service", "we", "us", or "our"), operated by SoundSideDesign LLC ("Company", "we", "us", or "our"). By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of these Terms, then you may not access the Service.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">1. ACCEPTANCE OF TERMS</h2>
            <p>
              By creating an account, accessing, or using PrepSuite, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy, which is incorporated herein by reference. If you do not agree to these Terms, you must not use the Service.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">2. DESCRIPTION OF SERVICE</h2>
            <p>
              PrepSuite is an AI-powered chess opponent analysis platform that provides scouting reports, game analysis, and strategic insights for chess players. The Service uses artificial intelligence and machine learning technologies to analyze chess games, player statistics, and provide recommendations.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">3. USER ACCOUNTS</h2>
            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">3.1 Account Creation</h3>
            <p>
              To use certain features of the Service, you must register for an account. You agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and account</li>
              <li>Accept responsibility for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">3.2 Account Eligibility</h3>
            <p>
              You must be at least 18 years old or the age of majority in your jurisdiction to use this Service. By using the Service, you represent and warrant that you meet this age requirement and have the legal capacity to enter into these Terms.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">3.3 Account Termination</h3>
            <p>
              You may delete your account at any time through your account settings. We reserve the right to suspend or terminate your account if you violate these Terms or engage in any fraudulent, abusive, or illegal activity. Upon termination, your right to use the Service will immediately cease, and we may delete your account and data in accordance with our Privacy Policy.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">4. USE OF THE SERVICE</h2>
            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">4.1 Permitted Use</h3>
            <p>
              You may use the Service for lawful purposes only and in accordance with these Terms. You agree to use the Service:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>For personal or professional chess preparation purposes</li>
              <li>In compliance with all applicable laws and regulations</li>
              <li>In a manner that does not infringe upon the rights of others</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">4.2 Prohibited Uses</h3>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Use the Service for any illegal purpose or in violation of any local, state, national, or international law</li>
              <li>Violate or encourage others to violate any applicable law or regulation</li>
              <li>Transmit any malicious code, viruses, or harmful data</li>
              <li>Attempt to gain unauthorized access to the Service or related systems</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
              <li>Use automated systems (bots, scrapers, etc.) to access the Service without our express written permission</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
              <li>Copy, modify, or create derivative works of the Service</li>
              <li>Use the Service to compete with us or to build a competing product</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Collect or store personal data about other users without their permission</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">5. INTELLECTUAL PROPERTY</h2>
            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">5.1 Service Ownership</h3>
            <p>
              The Service and its original content, features, and functionality are owned by SoundSideDesign LLC and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">5.2 User Content</h3>
            <p>
              You retain ownership of any data, reports, or content you create or upload to the Service ("User Content"). By using the Service, you grant us a worldwide, non-exclusive, royalty-free license to use, store, and process your User Content solely for the purpose of providing and improving the Service.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">5.3 Third-Party Content</h3>
            <p>
              The Service may contain content from third parties, including chess game data, player information, and other materials. We do not claim ownership of such third-party content and respect the intellectual property rights of third parties.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">6. ARTIFICIAL INTELLIGENCE</h2>
            <p>
              PrepSuite uses artificial intelligence and machine learning technologies, including services provided by third parties such as Google Cloud AI and Anthropic. By using the Service, you acknowledge that:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>AI-generated content may contain errors or inaccuracies</li>
              <li>AI analysis is provided for informational purposes and should not be the sole basis for decision-making</li>
              <li>You are responsible for verifying the accuracy of any AI-generated reports or analysis</li>
              <li>We are not liable for any decisions made based on AI-generated content</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">7. DISCLAIMERS</h2>
            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">7.1 Service Availability</h3>
            <p>
              We strive to provide reliable service but do not guarantee that the Service will be available, uninterrupted, secure, or error-free. We reserve the right to modify, suspend, or discontinue the Service at any time without notice.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">7.2 Accuracy of Information</h3>
            <p>
              While we strive to provide accurate information, we do not warrant that any information, analysis, or reports provided through the Service are accurate, complete, or current. Chess game data, player statistics, and other information may contain errors or be outdated.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">7.3 No Warranty</h3>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">8. LIMITATION OF LIABILITY</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL SOUNDSIDEDESIGN LLC, ITS AFFILIATES, AGENTS, DIRECTORS, EMPLOYEES, SUPPLIERS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, PUNITIVE, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO THE USE OF, OR INABILITY TO USE, THE SERVICE.
            </p>
            <p className="mt-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE USE OF OR ANY INABILITY TO USE ANY PORTION OF THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRIOR TO THE EVENT GIVING RISE TO THE LIABILITY, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">9. INDEMNIFICATION</h2>
            <p>
              You agree to defend, indemnify, and hold harmless SoundSideDesign LLC and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including without limitation reasonable attorney's fees and costs, arising out of or in any way connected with:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Your access to or use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party right, including without limitation any intellectual property right, publicity, confidentiality, property, or privacy right</li>
              <li>Any claim that your User Content caused damage to a third party</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">10. PRIVACY</h2>
            <p>
              Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy to understand how we collect, use, and protect your information. By using the Service, you consent to the collection and use of your information as described in our Privacy Policy.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">11. MODIFICATIONS TO TERMS</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify you of any material changes by:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Posting the new Terms on this page</li>
              <li>Updating the "Last updated" date at the top of this page</li>
              <li>Sending you an email notification (if you have provided an email address)</li>
            </ul>
            <p>
              Your continued use of the Service after any such modifications constitutes your acceptance of the modified Terms. If you do not agree to the modified Terms, you must stop using the Service.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">12. TERMINATION</h2>
            <p>
              We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will immediately cease.
            </p>
            <p className="mt-4">
              You may terminate your account at any time by using the account deletion feature in your account settings. All provisions of these Terms that by their nature should survive termination shall survive termination, including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">13. GOVERNING LAW AND DISPUTE RESOLUTION</h2>
            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">13.1 Governing Law</h3>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Connecticut, United States, without regard to its conflict of law provisions.
            </p>

            <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">13.2 Dispute Resolution</h3>
            <p>
              Any dispute arising out of or relating to these Terms or the Service shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. The arbitration shall take place in Fairfield County, Connecticut. You agree to waive any right to a jury trial and to participate in class action proceedings.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">14. SEVERABILITY</h2>
            <p>
              If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary so that these Terms shall otherwise remain in full force and effect and enforceable.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">15. ENTIRE AGREEMENT</h2>
            <p>
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and SoundSideDesign LLC regarding your use of the Service and supersede all prior agreements and understandings.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">16. WAIVER</h2>
            <p>
              No waiver of any term of these Terms shall be deemed a further or continuing waiver of such term or any other term, and our failure to assert any right or provision under these Terms shall not constitute a waiver of such right or provision.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">17. CONTACT INFORMATION</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="mb-4">
              SoundSideDesign LLC<br />
              180 Brookbend Rd<br />
              Fairfield, CT 06824<br />
              United States<br />
              Email: <a href="mailto:max@soundside.ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">max@soundside.ai</a>
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">18. ACKNOWLEDGMENT</h2>
            <p>
              BY USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ THESE TERMS OF SERVICE, UNDERSTAND THEM, AND AGREE TO BE BOUND BY THEM. IF YOU DO NOT AGREE TO THESE TERMS, YOU MUST NOT USE THE SERVICE.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
