export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
                <p className="text-gray-400 mb-8">
                    Last updated: January 15, 2026
                </p>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Webflow Team Tracker Extension</h2>
                    <p className="text-gray-300 mb-4">
                        This privacy policy explains how the Webflow Team Tracker Chrome extension
                        (&quot;the Extension&quot;) collects, uses, and protects your information.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Information We Collect</h2>
                    <p className="text-gray-300 mb-4">The Extension collects the following information:</p>
                    <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                        <li><strong>Display Name:</strong> The name you enter during setup (stored locally)</li>
                        <li><strong>Webflow Email:</strong> The email address of the Webflow account you&apos;re logged into</li>
                        <li><strong>Project Path:</strong> The current Webflow project/page you&apos;re working on</li>
                        <li><strong>Session Status:</strong> Whether you&apos;re actively using Webflow</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">How We Use This Information</h2>
                    <p className="text-gray-300 mb-4">We use this information solely to:</p>
                    <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                        <li>Display which team member is using each shared Webflow account</li>
                        <li>Show real-time activity status to team members</li>
                        <li>Prevent login conflicts when multiple people need access</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Data Storage</h2>
                    <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                        <li>Your display name is stored locally in Chrome&apos;s storage</li>
                        <li>Session data is stored in Firebase Firestore (hosted by Activeset)</li>
                        <li>Sessions are automatically deleted after 30 minutes of inactivity</li>
                        <li>Sessions are deleted immediately when you log out of Webflow</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Data Sharing</h2>
                    <p className="text-gray-300 mb-4">
                        Your session information is shared only with other members of your team
                        who have the Extension installed. We do not sell, trade, or transfer
                        your information to third parties.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">What We Do NOT Collect</h2>
                    <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                        <li>Browsing history or activity outside of Webflow</li>
                        <li>Passwords or authentication credentials</li>
                        <li>Personal files or content from your Webflow projects</li>
                        <li>Financial or payment information</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Your Rights</h2>
                    <p className="text-gray-300 mb-4">You can:</p>
                    <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                        <li>Uninstall the Extension at any time to stop all tracking</li>
                        <li>Log out of Webflow to immediately remove your session data</li>
                        <li>Request deletion of your data by contacting us</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Contact</h2>
                    <p className="text-gray-300">
                        For questions about this privacy policy, contact us at:{' '}
                        <a href="mailto:hello@activeset.co" className="text-blue-400 hover:underline">
                            hello@activeset.co
                        </a>
                    </p>
                </section>

                <div className="border-t border-gray-800 pt-6 mt-8">
                    <p className="text-gray-500 text-sm">
                        © {new Date().getFullYear()} Activeset. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}
