import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
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
            <Shield className="w-5 h-5 text-indigo-500 dark:text-indigo-500 text-indigo-600" />
            <h1 className="text-xl font-semibold text-white dark:text-white text-gray-900">Privacy Policy</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto py-8 px-6">
        <div className="prose prose-invert dark:prose-invert max-w-none">
          {/* Logo */}
          <div className="flex justify-center mb-12 select-none">
            <img src="/NewLogo.jpg" alt="Prepsuite.ai" className="h-10 w-auto select-none" draggable={false} />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold mb-2 text-white dark:text-white text-gray-900">PRIVACY POLICY</h1>
          <p className="text-slate-400 dark:text-slate-400 text-gray-600 mb-8">Last updated January 18, 2026</p>

          {/* Main Content */}
          <div className="space-y-6 text-slate-300 dark:text-slate-300 text-gray-700 leading-relaxed">
            <p>
              This Privacy Notice for <strong>SoundSideDesign LLC</strong> (<strong>"we,"</strong> <strong>"us,"</strong> or <strong>"our"</strong>), describes how and why we might access, collect, store, use, and/or share (<strong>"process"</strong>) your personal information when you use our services (<strong>"Services"</strong>), including when you:
            </p>

            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Visit our website at <a href="https://prepsuite.ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">prepsuite.ai</a> or any website of ours that links to this Privacy Notice</li>
              <li>Engage with us in other related ways, including any marketing or events</li>
            </ul>

            <p>
              <strong>Questions or concerns?</strong> Reading this Privacy Notice will help you understand your privacy rights and choices. We are responsible for making decisions about how your personal information is processed. If you do not agree with our policies and practices, please do not use our Services. If you still have any questions or concerns, please contact us at <a href="mailto:max@soundside.ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">max@soundside.ai</a>.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">SUMMARY OF KEY POINTS</h2>
            <p className="text-sm text-slate-400 dark:text-slate-400 text-gray-600 italic mb-4">
              This summary provides key points from our Privacy Notice, but you can find out more details about any of these topics by clicking the link following each key point or by using our table of contents below to find the section you are looking for.
            </p>

            <div className="space-y-3">
              <p><strong>What personal information do we process?</strong> When you visit, use, or navigate our Services, we may process personal information depending on how you interact with us and the Services, the choices you make, and the products and features you use. Learn more about <a href="#personalinfo" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">personal information you disclose to us</a>.</p>

              <p><strong>Do we process any sensitive personal information?</strong> Some of the information may be considered "special" or "sensitive" in certain jurisdictions, for example your racial or ethnic origins, sexual orientation, and religious beliefs. We do not process sensitive personal information.</p>

              <p><strong>Do we collect any information from third parties?</strong> We may collect information from public databases, marketing partners, social media platforms, and other outside sources. Learn more about <a href="#othersources" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">information collected from other sources</a>.</p>

              <p><strong>How do we process your information?</strong> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent. We process your information only when we have a valid legal reason to do so. Learn more about <a href="#infouse" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">how we process your information</a>.</p>

              <p><strong>In what situations and with which parties do we share personal information?</strong> We may share information in specific situations and with specific third parties. Learn more about <a href="#whoshare" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">when and with whom we share your personal information</a>.</p>

              <p><strong>How do we keep your information safe?</strong> We have adequate organizational and technical processes and procedures in place to protect your personal information. However, no electronic transmission over the internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorized third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Learn more about <a href="#infosafe" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">how we keep your information safe</a>.</p>

              <p><strong>What are your rights?</strong> Depending on where you are located geographically, the applicable privacy law may mean you have certain rights regarding your personal information. Learn more about <a href="#privacyrights" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">your privacy rights</a>.</p>

              <p><strong>How do you exercise your rights?</strong> The easiest way to exercise your rights is by <a href="https://app.termly.io/dsar/414ffd22-50e3-4ffc-b3ad-956693682f5e" target="_blank" rel="noopener noreferrer" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">submitting a data subject access request</a>, or by contacting us. We will consider and act upon any request in accordance with applicable data protection laws.</p>
            </div>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-white dark:text-white text-gray-900">TABLE OF CONTENTS</h2>
            <div className="space-y-2">
              <div><a href="#infocollect" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">1. WHAT INFORMATION DO WE COLLECT?</a></div>
              <div><a href="#infouse" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">2. HOW DO WE PROCESS YOUR INFORMATION?</a></div>
              <div><a href="#legalbases" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">3. WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR PERSONAL INFORMATION?</a></div>
              <div><a href="#whoshare" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</a></div>
              <div><a href="#ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?</a></div>
              <div><a href="#sociallogins" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</a></div>
              <div><a href="#inforetain" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">7. HOW LONG DO WE KEEP YOUR INFORMATION?</a></div>
              <div><a href="#infosafe" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">8. HOW DO WE KEEP YOUR INFORMATION SAFE?</a></div>
              <div><a href="#infominors" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">9. DO WE COLLECT INFORMATION FROM MINORS?</a></div>
              <div><a href="#privacyrights" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">10. WHAT ARE YOUR PRIVACY RIGHTS?</a></div>
              <div><a href="#DNT" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">11. CONTROLS FOR DO-NOT-TRACK FEATURES</a></div>
              <div><a href="#uslaws" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">12. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</a></div>
              <div><a href="#policyupdates" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">13. DO WE MAKE UPDATES TO THIS NOTICE?</a></div>
              <div><a href="#contact" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">14. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</a></div>
              <div><a href="#request" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">15. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</a></div>
            </div>

            {/* Section 1 */}
            <section id="infocollect" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">1. WHAT INFORMATION DO WE COLLECT?</h2>
              <h3 id="personalinfo" className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Personal information you disclose to us</h3>
              <p className="italic mb-4"><strong>In Short:</strong> We collect personal information that you provide to us.</p>
              <p className="mb-4">
                We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.
              </p>
              <p className="mb-4"><strong>Personal Information Provided by You.</strong> The personal information that we collect depends on the context of your interactions with us and the Services, the choices you make, and the products and features you use. The personal information we collect may include the following:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>names</li>
                <li>email addresses</li>
                <li>passwords</li>
                <li>contact or authentication data</li>
              </ul>
              <p className="mb-4"><strong>Sensitive Information.</strong> We do not process sensitive information.</p>
              <p className="mb-4">
                <strong>Social Media Login Data.</strong> We may provide you with the option to register with us using your existing social media account details, like your Facebook, X, or other social media account. If you choose to register in this way, we will collect certain profile information about you from the social media provider, as described in the section called <a href="#sociallogins" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">HOW DO WE HANDLE YOUR SOCIAL LOGINS?</a> below.
              </p>
              <p className="mb-4">All personal information that you provide to us must be true, complete, and accurate, and you must notify us of any changes to such personal information.</p>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Information automatically collected</h3>
              <p className="italic mb-4"><strong>In Short:</strong> Some information — such as your Internet Protocol (IP) address and/or browser and device characteristics — is collected automatically when you visit our Services.</p>
              <p className="mb-4">
                We automatically collect certain information when you visit, use, or navigate the Services. This information does not reveal your specific identity (like your name or contact information) but may include device and usage information, such as your IP address, browser and device characteristics, operating system, language preferences, referring URLs, device name, country, location, information about how and when you use our Services, and other technical information. This information is primarily needed to maintain the security and operation of our Services, and for our internal analytics and reporting purposes.
              </p>
              <p className="mb-4">The information we collect includes:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li><em>Log and Usage Data.</em> Log and usage data is service-related, diagnostic, usage, and performance information our servers automatically collect when you access or use our Services and which we record in log files. Depending on how you interact with us, this log data may include your IP address, device information, browser type, and settings and information about your activity in the Services (such as the date/time stamps associated with your usage, pages and files viewed, searches, and other actions you take such as which features you use), device event information (such as system activity, error reports (sometimes called "crash dumps"), and hardware settings).</li>
                <li><em>Device Data.</em> We collect device data such as information about your computer, phone, tablet, or other device you use to access the Services. Depending on the device used, this device data may include information such as your IP address (or proxy server), device and application identification numbers, location, browser type, hardware model, Internet service provider and/or mobile carrier, operating system, and system configuration information.</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Google API</h3>
              <p className="mb-4">
                Our use of information received from Google APIs will adhere to <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">Google API Services User Data Policy</a>, including the <a href="https://developers.google.com/terms/api-services-user-data-policy#limited-use" target="_blank" rel="noopener noreferrer" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">Limited Use requirements</a>.
              </p>

              <h3 id="othersources" className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Information collected from other sources</h3>
              <p className="italic mb-4"><strong>In Short:</strong> We may collect limited data from public databases, marketing partners, social media platforms, and other outside sources.</p>
              <p className="mb-4">
                In order to enhance our ability to provide relevant marketing, offers, and services to you and update our records, we may obtain information about you from other sources, such as public databases, joint marketing partners, affiliate programs, data providers, social media platforms, and from other third parties. This information includes mailing addresses, job titles, email addresses, phone numbers, intent data (or user behavior data), Internet Protocol (IP) addresses, social media profiles, social media URLs, and custom profiles, for purposes of targeted advertising and event promotion.
              </p>
              <p className="mb-4">
                If you interact with us on a social media platform using your social media account (e.g., Facebook or X), we receive personal information about you from such platforms such as your name, email address, and gender. You may have the right to withdraw your consent to processing your personal information. Learn more about <a href="#withdrawconsent" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">withdrawing your consent</a>. Any personal information that we collect from your social media account depends on your social media account's privacy settings. Please note that their own use of your information is not governed by this Privacy Notice.
              </p>
            </section>

            {/* Section 2 */}
            <section id="infouse" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">2. HOW DO WE PROCESS YOUR INFORMATION?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes only with your prior explicit consent.</p>
              <p className="mb-4"><strong>We process your personal information for a variety of reasons, depending on how you interact with our Services, including:</strong></p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li><strong>To facilitate account creation and authentication and otherwise manage user accounts.</strong> We may process your information so you can create and log in to your account, as well as keep your account in working order.</li>
                <li><strong>To save or protect an individual's vital interest.</strong> We may process your information when necessary to save or protect an individual's vital interest, such as to prevent harm.</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section id="legalbases" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">3. WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR INFORMATION?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> We only process your personal information when we believe it is necessary and we have a valid legal reason (i.e., legal basis) to do so under applicable law, like with your consent, to comply with laws, to provide you with services to enter into or fulfill our contractual obligations, to protect your rights, or to fulfill our legitimate business interests.</p>
              
              <p className="mb-4"><strong><u>If you are located in the EU or UK, this section applies to you.</u></strong></p>
              <p className="mb-4">The General Data Protection Regulation (GDPR) and UK GDPR require us to explain the valid legal bases we rely on in order to process your personal information. As such, we may rely on the following legal bases to process your personal information:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li><strong>Consent.</strong> We may process your information if you have given us permission (i.e., consent) to use your personal information for a specific purpose. You can withdraw your consent at any time. Learn more about <a href="#withdrawconsent" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">withdrawing your consent</a>.</li>
                <li><strong>Legal Obligations.</strong> We may process your information where we believe it is necessary for compliance with our legal obligations, such as to cooperate with a law enforcement body or regulatory agency, exercise or defend our legal rights, or disclose your information as evidence in litigation in which we are involved.</li>
                <li><strong>Vital Interests.</strong> We may process your information where we believe it is necessary to protect your vital interests or the vital interests of a third party, such as situations involving potential threats to the safety of any person.</li>
              </ul>

              <p className="mb-4 mt-6"><strong><u><em>If you are located in Canada, this section applies to you.</em></u></strong></p>
              <p className="mb-4">We may process your information if you have given us specific permission (i.e., express consent) to use your personal information for a specific purpose, or in situations where your permission can be inferred (i.e., implied consent). You can <a href="#withdrawconsent" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">withdraw your consent</a> at any time.</p>
              <p className="mb-4">In some exceptional cases, we may be legally permitted under applicable law to process your information without your consent, including, for example:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>If collection is clearly in the interests of an individual and consent cannot be obtained in a timely way</li>
                <li>For investigations and fraud detection and prevention</li>
                <li>For business transactions provided certain conditions are met</li>
                <li>If it is contained in a witness statement and the collection is necessary to assess, process, or settle an insurance claim</li>
                <li>For identifying injured, ill, or deceased persons and communicating with next of kin</li>
                <li>If we have reasonable grounds to believe an individual has been, is, or may be victim of financial abuse</li>
                <li>If it is reasonable to expect collection and use with consent would compromise the availability or the accuracy of the information and the collection is reasonable for purposes related to investigating a breach of an agreement or a contravention of the laws of Canada or a province</li>
                <li>If disclosure is required to comply with a subpoena, warrant, court order, or rules of the court relating to the production of records</li>
                <li>If it was produced by an individual in the course of their employment, business, or profession and the collection is consistent with the purposes for which the information was produced</li>
                <li>If the collection is solely for journalistic, artistic, or literary purposes</li>
                <li>If the information is publicly available and is specified by the regulations</li>
                <li>We may disclose de-identified information for approved research or statistics projects, subject to ethics oversight and confidentiality commitments</li>
              </ul>
            </section>

            {/* Section 4 */}
            <section id="whoshare" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> We may share information in specific situations described in this section and/or with the following third parties.</p>
              <p className="mb-4">We may need to share your personal information in the following situations:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li><strong>Business Transfers.</strong> We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section id="ai" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> We offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies.</p>
              <p className="mb-4">
                As part of our Services, we offer products, features, or tools powered by artificial intelligence, machine learning, or similar technologies (collectively, "AI Products"). These tools are designed to enhance your experience and provide you with innovative solutions. The terms in this Privacy Notice govern your use of the AI Products within our Services.
              </p>
              <p className="mb-4"><strong>Use of AI Technologies</strong></p>
              <p className="mb-4">
                We provide the AI Products through third-party service providers ("AI Service Providers"), including Anthropic and Google Cloud AI. As outlined in this Privacy Notice, your input, output, and personal information will be shared with and processed by these AI Service Providers to enable your use of our AI Products for purposes outlined in <a href="#legalbases" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR PERSONAL INFORMATION?</a> You must not use the AI Products in any way that violates the terms or policies of any AI Service Provider.
              </p>
              <p className="mb-4"><strong>Our AI Products</strong></p>
              <p className="mb-4">Our AI Products are designed for the following functions:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>AI automation</li>
                <li>AI insights</li>
                <li>AI predictive analytics</li>
              </ul>
              <p className="mb-4"><strong>How We Process Your Data Using AI</strong></p>
              <p className="mb-4">
                All personal information processed using our AI Products is handled in line with our Privacy Notice and our agreement with third parties. This ensures high security and safeguards your personal information throughout the process, giving you peace of mind about your data's safety.
              </p>
            </section>

            {/* Section 6 */}
            <section id="sociallogins" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> If you choose to register or log in to our Services using a social media account, we may have access to certain information about you.</p>
              <p className="mb-4">
                Our Services offer you the ability to register and log in using your third-party social media account details (like your Facebook or X logins). Where you choose to do this, we will receive certain profile information about you from your social media provider. The profile information we receive may vary depending on the social media provider concerned, but will often include your name, email address, friends list, and profile picture, as well as other information you choose to make public on such a social media platform.
              </p>
              <p className="mb-4">
                We will use the information we receive only for the purposes that are described in this Privacy Notice or that are otherwise made clear to you on the relevant Services. Please note that we do not control, and are not responsible for, other uses of your personal information by your third-party social media provider. We recommend that you review their privacy notice to understand how they collect, use, and share your personal information, and how you can set your privacy preferences on their sites and apps.
              </p>
            </section>

            {/* Section 7 */}
            <section id="inforetain" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">7. HOW LONG DO WE KEEP YOUR INFORMATION?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> We keep your information for as long as necessary to fulfill the purposes outlined in this Privacy Notice unless otherwise required by law.</p>
              <p className="mb-4">
                We will only keep your personal information for as long as it is necessary for the purposes set out in this Privacy Notice, unless a longer retention period is required or permitted by law (such as tax, accounting, or other legal requirements). No purpose in this notice will require us keeping your personal information for longer than the period of time in which users have an account with us.
              </p>
              <p className="mb-4">
                When we have no ongoing legitimate business need to process your personal information, we will either delete or anonymize such information, or, if this is not possible (for example, because your personal information has been stored in backup archives), then we will securely store your personal information and isolate it from any further processing until deletion is possible.
              </p>
            </section>

            {/* Section 8 */}
            <section id="infosafe" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">8. HOW DO WE KEEP YOUR INFORMATION SAFE?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> We aim to protect your personal information through a system of organizational and technical security measures.</p>
              <p className="mb-4">
                We have implemented appropriate and reasonable technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorized third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Although we will do our best to protect your personal information, transmission of personal information to and from our Services is at your own risk. You should only access the Services within a secure environment.
              </p>
            </section>

            {/* Section 9 */}
            <section id="infominors" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">9. DO WE COLLECT INFORMATION FROM MINORS?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> We do not knowingly collect data from or market to children under 18 years of age or the equivalent age as specified by law in your jurisdiction.</p>
              <p className="mb-4">
                We do not knowingly collect, solicit data from, or market to children under 18 years of age or the equivalent age as specified by law in your jurisdiction, nor do we knowingly sell such personal information. By using the Services, you represent that you are at least 18 or the equivalent age as specified by law in your jurisdiction or that you are the parent or guardian of such a minor and consent to such minor dependent's use of the Services. If we learn that personal information from users less than 18 years of age or the equivalent age as specified by law in your jurisdiction has been collected, we will deactivate the account and take reasonable measures to promptly delete such data from our records. If you become aware of any data we may have collected from children under age 18 or the equivalent age as specified by law in your jurisdiction, please contact us at <a href="mailto:max@soundside.ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">max@soundside.ai</a>.
              </p>
            </section>

            {/* Section 10 */}
            <section id="privacyrights" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">10. WHAT ARE YOUR PRIVACY RIGHTS?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> Depending on your state of residence in the US or in some regions, such as the European Economic Area (EEA), United Kingdom (UK), Switzerland, and Canada, you have rights that allow you greater access to and control over your personal information. You may review, change, or terminate your account at any time, depending on your country, province, or state of residence.</p>
              <p className="mb-4">
                In some regions (like the EEA, UK, Switzerland, and Canada), you have certain rights under applicable data protection laws. These may include the right (i) to request access and obtain a copy of your personal information, (ii) to request rectification or erasure; (iii) to restrict the processing of your personal information; (iv) if applicable, to data portability; and (v) not to be subject to automated decision-making. If a decision that produces legal or similarly significant effects is made solely by automated means, we will inform you, explain the main factors, and offer a simple way to request human review. In certain circumstances, you may also have the right to object to the processing of your personal information. You can make such a request by contacting us by using the contact details provided in the section <a href="#contact" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</a> below.
              </p>
              <p className="mb-4">We will consider and act upon any request in accordance with applicable data protection laws.</p>
              <p className="mb-4">
                If you are located in the EEA or UK and you believe we are unlawfully processing your personal information, you also have the right to complain to your <a href="https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm" target="_blank" rel="noopener noreferrer" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">Member State data protection authority</a> or <a href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">UK data protection authority</a>.
              </p>
              <p className="mb-4">
                If you are located in Switzerland, you may contact the <a href="https://www.edoeb.admin.ch/edoeb/en/home.html" target="_blank" rel="noopener noreferrer" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">Federal Data Protection and Information Commissioner</a>.
              </p>
              <p className="mb-4" id="withdrawconsent"><strong><u>Withdrawing your consent:</u></strong> If we are relying on your consent to process your personal information, which may be express and/or implied consent depending on the applicable law, you have the right to withdraw your consent at any time. You can withdraw your consent at any time by contacting us by using the contact details provided in the section <a href="#contact" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</a> below.</p>
              <p className="mb-4">However, please note that this will not affect the lawfulness of the processing before its withdrawal nor, when applicable law allows, will it affect the processing of your personal information conducted in reliance on lawful processing grounds other than consent.</p>
              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Account Information</h3>
              <p className="mb-4">If you would at any time like to review or change the information in your account or terminate your account, you can:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Log in to your account settings and update your user account.</li>
              </ul>
              <p className="mb-4">
                Upon your request to terminate your account, we will deactivate or delete your account and information from our active databases. However, we may retain some information in our files to prevent fraud, troubleshoot problems, assist with any investigations, enforce our legal terms and/or comply with applicable legal requirements.
              </p>
              <p className="mb-4">
                If you have questions or comments about your privacy rights, you may email us at <a href="mailto:max@soundside.ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">max@soundside.ai</a>.
              </p>
            </section>

            {/* Section 11 */}
            <section id="DNT" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">11. CONTROLS FOR DO-NOT-TRACK FEATURES</h2>
              <p className="mb-4">
                Most web browsers and some mobile operating systems and mobile applications include a Do-Not-Track ("DNT") feature or setting you can activate to signal your privacy preference not to have data about your online browsing activities monitored and collected. At this stage, no uniform technology standard for recognizing and implementing DNT signals has been finalized. As such, we do not currently respond to DNT browser signals or any other mechanism that automatically communicates your choice not to be tracked online. If a standard for online tracking is adopted that we must follow in the future, we will inform you about that practice in a revised version of this Privacy Notice.
              </p>
              <p className="mb-4">
                California law requires us to let you know how we respond to web browser DNT signals. Because there currently is not an industry or legal standard for recognizing or honoring DNT signals, we do not respond to them at this time.
              </p>
            </section>

            {/* Section 12 */}
            <section id="uslaws" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">12. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> If you are a resident of California, Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah, or Virginia, you may have the right to request access to and receive details about the personal information we maintain about you and how we have processed it, correct inaccuracies, get a copy of, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law. More information is provided below.</p>
              
              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Categories of Personal Information We Collect</h3>
              <p className="mb-4">
                The table below shows the categories of personal information we have collected in the past twelve (12) months. The table includes illustrative examples of each category and does not reflect the personal information we collect from you. For a comprehensive inventory of all personal information we process, please refer to the section <a href="#infocollect" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">WHAT INFORMATION DO WE COLLECT?</a>
              </p>

              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse border border-slate-700 dark:border-slate-700 border-gray-300">
                  <thead>
                    <tr className="bg-slate-900 dark:bg-slate-900 bg-gray-100">
                      <th className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3 text-left text-white dark:text-white text-gray-900 font-semibold">Category</th>
                      <th className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3 text-left text-white dark:text-white text-gray-900 font-semibold">Examples</th>
                      <th className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3 text-left text-white dark:text-white text-gray-900 font-semibold">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">A. Identifiers</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Contact details, such as real name, alias, postal address, telephone or mobile contact number, unique personal identifier, online identifier, Internet Protocol address, email address, and account name</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">B. Personal information as defined in the California Customer Records statute</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Name, contact information, education, employment, employment history, and financial information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">C. Protected classification characteristics under state or federal law</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Gender, age, date of birth, race and ethnicity, national origin, marital status, and other demographic data</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">D. Commercial information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Transaction information, purchase history, financial details, and payment information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">E. Biometric information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Fingerprints and voiceprints</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">F. Internet or other similar network activity</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Browsing history, search history, online behavior, interest data, and interactions with our and other websites, applications, systems, and advertisements</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">G. Geolocation data</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Device location</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">H. Audio, electronic, sensory, or similar information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Images and audio, video or call recordings created in connection with our business activities</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">I. Professional or employment-related information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Business contact details in order to provide you our Services at a business level or job title, work history, and professional qualifications if you apply for a job with us</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">J. Education Information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Student records and directory information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">K. Inferences drawn from collected personal information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">Inferences drawn from any of the collected personal information listed above to create a profile or summary about, for example, an individual's preferences and characteristics</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">L. Sensitive personal Information</td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3"></td>
                      <td className="border border-slate-700 dark:border-slate-700 border-gray-300 p-3">NO</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="mb-4">We may also collect other personal information outside of these categories through instances where you interact with us in person, online, or by phone or mail in the context of:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Receiving help through our customer support channels;</li>
                <li>Participation in customer surveys or contests; and</li>
                <li>Facilitation in the delivery of our Services and to respond to your inquiries.</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Sources of Personal Information</h3>
              <p className="mb-4">Learn more about the sources of personal information we collect in <a href="#infocollect" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">WHAT INFORMATION DO WE COLLECT?</a></p>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">How We Use and Share Personal Information</h3>
              <p className="mb-4">Learn more about how we use your personal information in the section, <a href="#infouse" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">HOW DO WE PROCESS YOUR INFORMATION?</a></p>

              <p className="mb-4"><strong>Will your information be shared with anyone else?</strong></p>
              <p className="mb-4">
                We may disclose your personal information with our service providers pursuant to a written contract between us and each service provider. Learn more about how we disclose personal information to in the section, <a href="#whoshare" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</a>
              </p>
              <p className="mb-4">
                We may use your personal information for our own business purposes, such as for undertaking internal research for technological development and demonstration. This is not considered to be "selling" of your personal information.
              </p>
              <p className="mb-4">
                We have not disclosed, sold, or shared any personal information to third parties for a business or commercial purpose in the preceding twelve (12) months. We will not sell or share personal information in the future belonging to website visitors, users, and other consumers.
              </p>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Your Rights</h3>
              <p className="mb-4">You have rights under certain US state data protection laws. However, these rights are not absolute, and in certain cases, we may decline your request as permitted by law. These rights include:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li><strong>Right to know</strong> whether or not we are processing your personal data</li>
                <li><strong>Right to access</strong> your personal data</li>
                <li><strong>Right to correct</strong> inaccuracies in your personal data</li>
                <li><strong>Right to request</strong> the deletion of your personal data</li>
                <li><strong>Right to obtain a copy</strong> of the personal data you previously shared with us</li>
                <li><strong>Right to non-discrimination</strong> for exercising your rights</li>
                <li><strong>Right to opt out</strong> of the processing of your personal data if it is used for targeted advertising (or sharing as defined under California's privacy law), the sale of personal data, or profiling in furtherance of decisions that produce legal or similarly significant effects ("profiling")</li>
              </ul>

              <p className="mb-4">Depending upon the state where you live, you may also have the following rights:</p>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>Right to access the categories of personal data being processed (as permitted by applicable law, including the privacy law in Minnesota)</li>
                <li>Right to obtain a list of the categories of third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in California, Delaware, and Maryland)</li>
                <li>Right to obtain a list of specific third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in Minnesota and Oregon)</li>
                <li>Right to obtain a list of third parties to which we have sold personal data (as permitted by applicable law, including the privacy law in Connecticut)</li>
                <li>Right to review, understand, question, and depending on where you live, correct how personal data has been profiled (as permitted by applicable law, including the privacy law in Connecticut and Minnesota)</li>
                <li>Right to limit use and disclosure of sensitive personal data (as permitted by applicable law, including the privacy law in California)</li>
                <li>Right to opt out of the collection of sensitive data and personal data collected through the operation of a voice or facial recognition feature (as permitted by applicable law, including the privacy law in Florida)</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">How to Exercise Your Rights</h3>
              <p className="mb-4">
                To exercise these rights, you can contact us by submitting a <a href="https://app.termly.io/dsar/414ffd22-50e3-4ffc-b3ad-956693682f5e" target="_blank" rel="noopener noreferrer" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">data subject access request</a>, by emailing us at <a href="mailto:max@soundside.ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">max@soundside.ai</a>, or by referring to the contact details at the bottom of this document.
              </p>
              <p className="mb-4">
                Under certain US state data protection laws, you can designate an authorized agent to make a request on your behalf. We may deny a request from an authorized agent that does not submit proof that they have been validly authorized to act on your behalf in accordance with applicable laws.
              </p>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Request Verification</h3>
              <p className="mb-4">
                Upon receiving your request, we will need to verify your identity to determine you are the same person about whom we have the information in our system. We will only use personal information provided in your request to verify your identity or authority to make the request. However, if we cannot verify your identity from the information already maintained by us, we may request that you provide additional information for the purposes of verifying your identity and for security or fraud-prevention purposes.
              </p>
              <p className="mb-4">
                If you submit the request through an authorized agent, we may need to collect additional information to verify your identity before processing your request and the agent will need to provide a written and signed permission from you to submit such request on your behalf.
              </p>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">Appeals</h3>
              <p className="mb-4">
                Under certain US state data protection laws, if we decline to take action regarding your request, you may appeal our decision by emailing us at <a href="mailto:max@soundside.ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">max@soundside.ai</a>. We will inform you in writing of any action taken or not taken in response to the appeal, including a written explanation of the reasons for the decisions. If your appeal is denied, you may submit a complaint to your state attorney general.
              </p>

              <h3 className="text-xl font-semibold mb-3 mt-6 text-white dark:text-white text-gray-900">California "Shine The Light" Law</h3>
              <p className="mb-4">
                California Civil Code Section 1798.83, also known as the "Shine The Light" law, permits our users who are California residents to request and obtain from us, once a year and free of charge, information about categories of personal information (if any) we disclosed to third parties for direct marketing purposes and the names and addresses of all third parties with which we shared personal information in the immediately preceding calendar year. If you are a California resident and would like to make such a request, please submit your request in writing to us by using the contact details provided in the section <a href="#contact" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</a> below.
              </p>
            </section>

            {/* Section 13 */}
            <section id="policyupdates" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">13. DO WE MAKE UPDATES TO THIS NOTICE?</h2>
              <p className="italic mb-4"><strong>In Short:</strong> Yes, we will update this notice as necessary to stay compliant with relevant laws.</p>
              <p className="mb-4">
                We may update this Privacy Notice from time to time. The updated version will be indicated by an updated "Revised" date at the top of this Privacy Notice. If we make material changes to this Privacy Notice, we may notify you either by prominently posting a notice of such changes or by directly sending you a notification. We encourage you to review this Privacy Notice frequently to be informed of how we are protecting your information.
              </p>
            </section>

            {/* Section 14 */}
            <section id="contact" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">14. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</h2>
              <p className="mb-4">
                If you have questions or comments about this notice, you may email us at <a href="mailto:max@soundside.ai" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">max@soundside.ai</a> or contact us by post at:
              </p>
              <p className="mb-4">
                SoundSideDesign LLC<br />
                180 Brookbend Rd<br />
                Fairfield, CT 06824<br />
                United States
              </p>
            </section>

            {/* Section 15 */}
            <section id="request" className="mt-12">
              <h2 className="text-2xl font-bold mb-4 text-white dark:text-white text-gray-900">15. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</h2>
              <p className="mb-4">
                Based on the applicable laws of your country or state of residence in the US, you may have the right to request access to the personal information we collect from you, details about how we have processed it, correct inaccuracies, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law. To request to review, update, or delete your personal information, please <a href="https://app.termly.io/dsar/414ffd22-50e3-4ffc-b3ad-956693682f5e" target="_blank" rel="noopener noreferrer" className="text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:underline">fill out and submit a data subject access request</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
