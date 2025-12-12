import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Data Constants (Copied from ProposalEditor.tsx) ---

const DEFAULT_TITLES = [
    "Website Proposal",
    "Website Design & Development Proposal",
    "Webflow Development Proposal",
    "Copy, Branding, Website Design & Development Proposal",
    "Website Development Proposal ([Method])",
    "Webflow Website Proposal",
    "Web Design, Copy, and SEO Proposal"
];

const DEFAULT_AGENCIES = [
    "ActiveSet"
];

const DEFAULT_ABOUT_US = [
    {
        id: 'activeset',
        label: 'ActiveSet Default',
        text: `<p>ActiveSet is a conversion-first Webflow agency for B2B brands. We design, write, and build websites that turn right-fit traffic into qualified pipeline—then make it easy for your marketing team to run. From strategy and messaging to design, development, and migration, we ship fast, scalable sites that are simple to manage and ready to grow.</p>

<h3>WHAT WE DO</h3>
<ul>
<li>Strategy and conversion copy to clarify your value prop and buyer journeys</li>
<li>Website design that aligns brand, UX, and measurable outcomes</li>
<li>Webflow development engineered for speed, accessibility, and SEO, using Client-First and modular CMS structures</li>
<li>Migrations and maintenance that protect SEO and empower marketers with clean CMS governance</li>
</ul>

<h3>WHY ACTIVESET</h3>
<ul>
<li>Built for marketers: launch pages, campaigns, and content without developer bottlenecks</li>
<li>Proven outcomes: 70+ B2B sites shipped with conversion lift and faster time-to-value</li>
<li>Enterprise-ready craft: integrations with HubSpot, Salesforce, analytics, and custom stacks</li>
<li>Reliable delivery: a clear process from discovery to strategic launch, plus post‑launch support</li>
</ul>

<h3>OUR PROMISE</h3>
<p>We build websites that don’t just look great in a portfolio—they work for your business. Clean architecture, performance by default, SEO baked in, and a CMS your team will actually love using.</p>`
    },
    {
        id: 'standard',
        label: 'Standard Agency',
        text: "<p>We are a full-service digital agency committed to helping businesses grow online. With over 10 years of experience, we specialize in web design, development, and digital marketing strategies tailored to your unique needs.</p>"
    },
    {
        id: 'modern',
        label: 'Modern Tech',
        text: "<p>We build digital products for the future. Our team of innovators and creators is dedicated to pushing boundaries and delivering exceptional user experiences through cutting-edge technology.</p>"
    },
    {
        id: 'corporate',
        label: 'Corporate Professional',
        text: "<p>Our firm provides comprehensive consulting and implementation services. We pride ourselves on delivering robust, scalable solutions that drive enterprise value, operational efficiency, and sustainable growth.</p>"
    },
    {
        id: 'creative',
        label: 'Creative Studio',
        text: "<p>We are a collective of artists and technologists weaving digital stories. We believe in the power of design to transform brands, captivate audiences, and create lasting emotional connections.</p>"
    }
];

const DEFAULT_TERMS = [
    {
        id: 'standard',
        label: 'Standard Terms',
        text: `<p><strong>1. Payment Terms</strong></p>
<p>Invoices are sent upon completion of each phase. Payment is due within 15 days of invoice date. Late payments may incur a 1.5% monthly interest charge.</p>
<p><strong>2. Project Timeline</strong></p>
<p>The timeline provided is an estimate. Delays caused by the client (e.g., late content delivery, feedback delays) may impact the final delivery date.</p>
<p><strong>3. Intellectual Property</strong></p>
<p>Upon full payment, all rights to the final deliverables are transferred to the client. The agency reserves the right to specific tools, libraries, or frameworks used.</p>`
    },
    {
        id: 'comprehensive',
        label: 'Comprehensive',
        text: `<p><strong>1. Services & Scope</strong></p>
<p>The Agency agrees to perform the services described in the Proposal. Any additional work outside this scope will require a separate change order.</p>
<p><strong>2. Client Responsibilities</strong></p>
<p>The Client agrees to provide necessary materials, access, and feedback in a timely manner. Failure to do so may result in project delays.</p>
<p><strong>3. Payment Schedule</strong></p>
<p>A non-refundable deposit of 50% is required to commence work. The remaining balance is due upon project completion and before final file delivery.</p>
<p><strong>4. Confidentiality</strong></p>
<p>Both parties agree to keep all proprietary information confidential and not disclose it to third parties without prior written consent.</p>`
    }
];

const SERVICE_SNIPPETS = {
    'webflow-dev': "Webflow Development: Utilizing the 'Client-First' framework for stable, secure, and manageable site maintenance.",
    'website-design': "Website Design: Using a strategy-first approach to create a cohesive brand identity and high-performing, visually compelling website that's easy to manage and scale.",
    'branding-design': "Branding & Website Design: Using a strategy-first approach to create a cohesive brand identity and high-performing, visually compelling website that's easy to manage and scale.",
    'copy': "Copy: Using a research-led approach to craft clear, compelling messaging and brand voice—designed to connect with your audience, support business goals, and drive meaningful action across every touchpoint.",
    'strategy-copy': "Strategy & Copy: Using a research-led approach to craft clear, compelling messaging and brand voice—designed to connect with your audience, support business goals, and drive meaningful action across every touchpoint.",
    'webflow-migration': "Webflow Migration: Seamless transfer of your website with full support for SEO, ensuring rankings, performance, and visibility are preserved.",
    'brochure-design': "Brochure Design: Creating visually engaging layouts that communicate your brand story with clarity, consistency, and professional appeal.",
    'full-webflow': "Webflow Development: Delivering high-quality, SEO-optimized, CMS-powered Webflow websites that combine custom design with development flexibility—making your site fast, secure, and future-ready.",
};

const FINAL_DELIVERABLES = [
    {
        id: 'webflow-standard',
        label: 'Webflow Standard',
        text: "The final deliverable for this project will be a fully functional, responsive website. It will be built on Webflow in a stable and secure environment."
    },
    {
        id: 'brand-focused',
        label: 'Brand Focused',
        text: "The final deliverable for this project will be a visually compelling, responsive website with a cohesive brand identity. Designed with a focus on aesthetics, usability, and consistency, the site will effectively communicate your brand and engage your audience across all devices."
    }
];

async function seed() {
    console.log('Starting seed process...');

    try {
        await setDoc(doc(db, 'configurations', 'titles'), { items: DEFAULT_TITLES });
        console.log('Seeded details: titles');

        await setDoc(doc(db, 'configurations', 'agencies'), { items: DEFAULT_AGENCIES });
        console.log('Seeded details: agencies');

        await setDoc(doc(db, 'configurations', 'about_us'), { items: DEFAULT_ABOUT_US });
        console.log('Seeded details: about_us');

        await setDoc(doc(db, 'configurations', 'terms'), { items: DEFAULT_TERMS });
        console.log('Seeded details: terms');

        await setDoc(doc(db, 'configurations', 'services'), { items: SERVICE_SNIPPETS });
        console.log('Seeded details: services');

        await setDoc(doc(db, 'configurations', 'deliverables'), { items: FINAL_DELIVERABLES });
        console.log('Seeded details: deliverables');

        console.log('Seed process completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seed();
