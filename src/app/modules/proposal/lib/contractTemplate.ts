import type {
    Proposal,
    ContractData,
    ContractClause,
    ContractParty,
    BillingCycle,
} from '../types/Proposal';

/**
 * Standard long-term retainer agreement, modelled on the ActiveSet ×
 * Lighthouse Canton template. Clause bodies are HTML and contain {{tokens}}
 * that are interpolated from the structured fields when a contract is created
 * (and again when "Reset to standard template" is used). After that the text
 * is freeform and editable per contract.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    SGD: '$',
    AUD: '$',
    CAD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    INR: '₹',
    CHF: 'CHF',
};

export function currencySymbol(currency: string): string {
    return CURRENCY_SYMBOLS[currency?.toUpperCase()] || '';
}

export function formatMoney(amount: number, currency: string): string {
    const code = (currency || 'USD').toUpperCase();
    const sym = currencySymbol(code);
    const grouped = (Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', {
        maximumFractionDigits: 2,
    });
    return `${code} ${sym}${grouped}`.trim();
}

const ORDINAL = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** "2026-01-01" -> "1st January 2026". Falls back to the raw string. */
export function formatContractDate(iso?: string): string {
    if (!iso) return '________________';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return `${ORDINAL(d.getDate())} ${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

const BILLING_NOUN: Record<BillingCycle, string> = {
    monthly: 'month',
    quarterly: 'quarter',
    annually: 'year',
};

const BILLING_ADJ: Record<BillingCycle, string> = {
    monthly: 'monthly',
    quarterly: 'quarterly',
    annually: 'annual',
};

export function billingNoun(cycle: BillingCycle): string {
    return BILLING_NOUN[cycle] || 'month';
}

/** Adds `months` to an ISO date, returns ISO (YYYY-MM-DD) or null. */
export function computeLockInEnd(effectiveDate: string, lockInMonths: number): string | null {
    if (!effectiveDate || !lockInMonths || lockInMonths <= 0) return null;
    const d = new Date(effectiveDate + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + lockInMonths);
    return d.toISOString().split('T')[0];
}

/**
 * Generates the body of the auto-managed "Term & Minimum Commitment" clause
 * from the structured fields. Re-run whenever those fields change while the
 * clause is still flagged `generated`.
 */
export function generateTermClauseBody(contract: ContractData): string {
    const start = formatContractDate(contract.effectiveDate);
    const fee = formatMoney(contract.retainer.amount, contract.retainer.currency);
    const cycleNoun = billingNoun(contract.retainer.billingCycle);
    const lock = contract.lockInMonths;

    if (!lock || lock <= 0) {
        return [
            `<p>This Agreement shall commence on <strong>${start}</strong> and shall continue on a rolling ${cycleNoun}-to-${cycleNoun} basis until terminated in accordance with the Termination section of this Agreement.</p>`,
            `<p>The retainer fee of <strong>${fee}</strong> per ${cycleNoun} is payable for each ${cycleNoun} during the term of this Agreement.</p>`,
        ].join('');
    }

    const endIso = computeLockInEnd(contract.effectiveDate, lock);
    const end = endIso ? formatContractDate(endIso) : '________________';
    return [
        `<p>This Agreement shall commence on <strong>${start}</strong> and the Company commits to a minimum, non-cancellable term of <strong>${lock} ${lock === 1 ? 'month' : 'months'}</strong> (the &ldquo;Minimum Term&rdquo;), expiring on <strong>${end}</strong>.</p>`,
        `<p>The retainer fee of <strong>${fee}</strong> per ${cycleNoun} is payable for each ${cycleNoun} throughout the Minimum Term. Neither party may terminate this Agreement for convenience before the end of the Minimum Term; termination during the Minimum Term is permitted only for material, uncured breach as set out in the Termination section.</p>`,
        `<p>If the Company terminates without cause prior to the expiry of the Minimum Term, the Company shall remain liable for the retainer fees that would have become due for the remainder of the Minimum Term.</p>`,
        `<p>After the Minimum Term this Agreement continues on a rolling ${cycleNoun}-to-${cycleNoun} basis until terminated in accordance with the Termination section.</p>`,
    ].join('');
}

interface StandardClause {
    id: string;
    heading: string;
    body: string;
    generated?: boolean;
}

// Bodies use {{tokens}}; the `term` clause is regenerated from structured
// fields, so its template body is a placeholder only.
const STANDARD_CLAUSES: StandardClause[] = [
    {
        id: 'scope',
        heading: 'Scope of Services',
        body:
            `<p>Under the terms of this Agreement, the Consultant will provide the following Services to the Company:</p>` +
            `<p><strong>Core Website Maintenance &amp; Support</strong></p>` +
            `<ul>` +
            `<li>Proactive technical support and bug resolution to ensure uninterrupted website stability and optimal performance, including general technical consultation.</li>` +
            `<li>Performance optimization and audits — reviewing and optimizing site assets to improve load times, Core Web Vitals, and technical SEO health.</li>` +
            `<li>Responsive design refinement across all devices and screen sizes.</li>` +
            `</ul>` +
            `<p><strong>Web Design &amp; Motion</strong></p>` +
            `<ul>` +
            `<li>High-fidelity layouts, visual assets, and interface elements for new pages and sections.</li>` +
            `<li>Custom interactions, animations, and motion effects to enhance engagement.</li>` +
            `</ul>` +
            `<p><strong>New Development &amp; Integration</strong></p>` +
            `<ul>` +
            `<li>Development and deployment of new pages, templates, sections, or advanced functionality as needed.</li>` +
            `<li>Integration of third-party services and tools such as analytics platforms and forms.</li>` +
            `</ul>`,
    },
    {
        id: 'compensation',
        heading: 'Compensation',
        body:
            `<p>For the Services rendered by the Consultant as outlined in the Scope of Services, the Company shall pay the Consultant a ${'{{billingAdj}}'} fee of <strong>{{retainerAmount}}</strong>. This fee is payable for each {{billingNoun}} during the term of this Agreement.</p>`,
    },
    {
        id: 'payment',
        heading: 'Payment Schedule',
        body:
            `<p>The Company will pay the Consultant on a {{billingAdj}} basis in line with the Company&rsquo;s payment cycle. Where no specific payment cycle applies, payment is due within the first week of the {{billingNoun}} following the {{billingNoun}} in which the work was performed.</p>` +
            `<p>Invoices shall be due and payable thirty (30) days from receipt and approval of the invoice and the services referenced thereon. Invoices may be submitted electronically to {{clientEmail}}.</p>`,
    },
    {
        id: 'term',
        heading: 'Term &amp; Minimum Commitment',
        body: `<p>{{termClause}}</p>`,
        generated: true,
    },
    {
        id: 'consideration',
        heading: 'Consideration',
        body:
            `<ul>` +
            `<li>As compensation in full for Services performed under this Agreement, the Consultant shall invoice the Company and the Company shall pay the Consultant in accordance with the fees and schedule set forth herein.</li>` +
            `<li>In providing Services to the Company, the Consultant acts as an independent contractor and not as an employee or agent of the Company. The Consultant has no authority, express or implied, to commit or obligate the Company in any manner whatsoever.</li>` +
            `<li>The Consultant is responsible for the payment of all taxes applicable to any compensation paid to the Consultant, and the Company shall not withhold or pay any income, social security, unemployment or workers&rsquo; compensation taxes related to the work performed under this Agreement.</li>` +
            `</ul>`,
    },
    {
        id: 'confidentiality',
        heading: 'Confidential Information / Non-Disclosure',
        body:
            `<ul>` +
            `<li>During the course of the Services, the Consultant may be exposed to confidential and proprietary information, including products, processes, technologies, concepts, customer information, personal data, and other information designated as confidential (&ldquo;Confidential Information&rdquo;).</li>` +
            `<li>Confidential Information does not include information already known to or independently developed by the receiving party; information that becomes public through no wrongful act of the receiving party; information lawfully received from a third party with the right to disclose it; or information disclosed by the owner without restriction.</li>` +
            `<li>The receiving party agrees not to reveal, disclose, commercialize, or use Confidential Information for any purpose other than performing the Services, and may disclose it only to individuals with a legitimate need to know who are bound by similar obligations.</li>` +
            `<li>Confidential Information may not be disclosed to any third party without prior written authorization from the owning party, except where disclosure is required by law, in which case the receiving party shall provide prompt prior notice and cooperate to allow the owner to seek protective orders.</li>` +
            `<li>Upon termination of this Agreement or upon the Company&rsquo;s request, the receiving party shall promptly return or destroy all Confidential Information and copies and, if requested, provide proof of destruction.</li>` +
            `</ul>`,
    },
    {
        id: 'inventions',
        heading: 'Improvements and Inventions',
        body:
            `<p>The Consultant shall promptly notify and fully disclose to the Company, in writing, the existence and nature of any ideas, designs, practices, processes, improvements and inventions (&ldquo;Inventions&rdquo;) which the Consultant conceives or first reduces to practice during the term of this Agreement, or within six (6) months after termination, if such Inventions relate to a product or process upon which the Consultant worked during the term of this Agreement.</p>`,
    },
    {
        id: 'termination',
        heading: 'Termination',
        body:
            `<p>Notwithstanding any contrary provision contained elsewhere in this Agreement, this Agreement and the rights and obligations hereunder may be terminated:</p>` +
            `<ul>` +
            `<li>By the Company immediately if the Consultant defaults in the performance of its obligations under this Agreement, including failure to provide the products or services within the times specified. Any monies due to the Consultant shall be fairly compensated against actual work performed; or</li>` +
            `<li>By the Consultant immediately if the Company defaults in the performance of its obligations under this Agreement.</li>` +
            `</ul>` +
            `<p>Subject to the Term &amp; Minimum Commitment section, either party may otherwise terminate this Agreement by providing thirty (30) days&rsquo; advance written notice.</p>`,
    },
    {
        id: 'ip',
        heading: 'Intellectual Property',
        body:
            `<p>The Consultant shall retain all rights to pre-existing ideas, processes, procedures and materials used by the Consultant in developing or providing products and/or services to the Company. The Consultant warrants that the intellectual property and products it produces shall be original and shall not infringe any third party&rsquo;s patents, trademarks, trade secrets, copyrights or other proprietary rights. Where third-party materials are incorporated, the Consultant shall obtain all authorizations necessary to allow the Company to fully exploit the intellectual property and products produced.</p>`,
    },
    {
        id: 'ownership',
        heading: 'Ownership of Prepared Information',
        body:
            `<ul>` +
            `<li>All technical and business information in any medium — including data, specifications, drawings, records, reports, proposals, software and related documentation, inventions, concepts and research (&ldquo;Information&rdquo;) — originated or prepared by or for the Consultant in connection with the Services shall be promptly provided to the Company.</li>` +
            `<li>All such Information shall be the exclusive property of the Company and shall be deemed &ldquo;works made for hire&rdquo;. To the extent it does not so qualify, the Consultant hereby irrevocably assigns to the Company all rights, title and interest in such Information, including copyrights, patent and moral rights.</li>` +
            `<li>The Consultant shall assist the Company, at the Company&rsquo;s expense and without additional charge, in securing and protecting intellectual property rights, including executing assignments and other documents.</li>` +
            `</ul>`,
    },
    {
        id: 'indemnification',
        heading: 'Indemnification',
        body:
            `<p>To the fullest extent permitted by law, the Consultant shall indemnify, hold harmless and defend the Company from and against any and all loss, damage, liability, judgment, claim, cost or expense (including reasonable attorneys&rsquo; fees) resulting from injury or damage to any person or entity arising out of or in connection with the Consultant&rsquo;s performance under this Agreement, including claims alleging violation of copyright, trademark, trade name or other intangible property rights.</p>`,
    },
    {
        id: 'liability',
        heading: 'Limitation of Liability',
        body:
            `<p>Neither party shall be liable to the other for special, indirect, consequential or incidental losses or damages of any kind, including lost profits, lost data, lost savings, or costs of substitute services, regardless of whether arising from breach of contract, warranty, tort, strict liability or otherwise, even if advised of the possibility of such loss. Each party&rsquo;s aggregate liability for damages under this Agreement, regardless of the form of action, shall not exceed the total amount payable to the Consultant under this Agreement.</p>`,
    },
    {
        id: 'warranty',
        heading: 'Warranty of Services',
        body:
            `<p>The Consultant agrees that Services shall be performed in a professional and workmanlike manner and that the intellectual property and products provided to the Company shall meet the requirements set forth in the Scope of Services. The Consultant further warrants that it has all rights to enter into this Agreement and that there are no impediments to its execution of this Agreement or performance of the Services.</p>`,
    },
    {
        id: 'assignment',
        heading: 'Assignment',
        body:
            `<p>This Agreement and the Consultant&rsquo;s rights and obligations shall not be assignable, in whole or in part, without the prior written consent of the Company. If the Consultant is a partnership or corporation, any change in ownership is an &ldquo;assignment&rdquo; under this provision. Any assignment without the Company&rsquo;s consent is void.</p>`,
    },
    {
        id: 'governingLaw',
        heading: 'Governing Law',
        body:
            `<p>This Agreement shall be construed and enforced in accordance with the laws of <strong>{{governingLawCountry}}</strong>, without reference to its conflict of laws principles. The courts of <strong>{{jurisdictionCity}}</strong> shall have exclusive jurisdiction in all matters relating to this Agreement, and the parties consent to the jurisdiction of those courts.</p>`,
    },
    {
        id: 'injunctive',
        heading: 'Injunctive Relief',
        body:
            `<p>The Consultant acknowledges that it would be difficult to fully compensate the Company for damages resulting from any breach of the confidentiality, intellectual property, ownership or indemnification provisions of this Agreement. Accordingly, in the event of any actual or threatened breach of such provisions, the Company shall, in addition to any other remedies, be entitled to temporary and/or permanent injunctive relief to enforce such provisions.</p>`,
    },
    {
        id: 'severability',
        heading: 'Severability',
        body:
            `<p>This Agreement shall be construed in a manner that renders its provisions valid and enforceable to the maximum extent possible under applicable law. If any provision is determined by a court of competent jurisdiction to be invalid or unenforceable, such provision shall be deleted or modified to make it enforceable, and the validity and enforceability of the remaining provisions shall be unaffected.</p>`,
    },
    {
        id: 'forceMajeure',
        heading: 'Force Majeure',
        body:
            `<p>Neither party shall be liable for any failure to perform under this Agreement when such failure is due to causes beyond that party&rsquo;s reasonable control, including acts of governmental authorities, acts of terrorism, natural catastrophe, fire, storm, flood, earthquake, accident, strikes, and prolonged shortage of energy. In such event, the time for completion shall be extended by a period reasonably necessary to overcome the effect of the delay.</p>`,
    },
    {
        id: 'entireAgreement',
        heading: 'Entire Agreement',
        body:
            `<p>This Agreement, inclusive of the Scope of Services, embodies the entire agreement between the parties and supersedes all prior contracts, representations, negotiations or letters, whether written or oral, regarding the subject matter hereof. No subsequent statement or writing purporting to modify or add to the terms hereof shall be binding unless consented to in writing by duly authorized representatives of both parties.</p>`,
    },
];

interface ClauseVars {
    clientLegalName: string;
    clientEmail: string;
    retainerAmount: string;
    billingAdj: string;
    billingNoun: string;
    governingLawCountry: string;
    jurisdictionCity: string;
    termClause: string;
}

function buildVars(contract: ContractData): ClauseVars {
    return {
        clientLegalName: contract.client.legalName || 'the Company',
        clientEmail: contract.client.email || '________________',
        retainerAmount: formatMoney(contract.retainer.amount, contract.retainer.currency),
        billingAdj: BILLING_ADJ[contract.retainer.billingCycle] || 'monthly',
        billingNoun: billingNoun(contract.retainer.billingCycle),
        governingLawCountry: contract.governingLawCountry || '________________',
        jurisdictionCity: contract.jurisdictionCity || '________________',
        termClause: '', // term clause uses generateTermClauseBody, not token replace
    };
}

function interpolate(html: string, vars: ClauseVars): string {
    const dict: Record<string, string> = { ...vars };
    return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        const v = dict[key];
        return v === undefined ? `{{${key}}}` : v;
    });
}

/**
 * Returns a fresh, fully-interpolated clause list for the given structured
 * fields. The `term` clause is produced by generateTermClauseBody().
 */
export function buildContractClauses(contract: ContractData): ContractClause[] {
    const vars = buildVars(contract);
    return STANDARD_CLAUSES.map((c) => {
        if (c.id === 'term') {
            return {
                id: c.id,
                heading: c.heading,
                body: generateTermClauseBody(contract),
                generated: true,
            };
        }
        return {
            id: c.id,
            heading: c.heading,
            body: interpolate(c.body, vars),
            generated: false,
        };
    });
}

const today = (): string => new Date().toISOString().split('T')[0];

export function blankContractData(overrides?: Partial<ContractData>): ContractData {
    const base: ContractData = {
        client: {
            legalName: '',
            address: '',
            signatoryName: '',
            signatoryTitle: '',
            email: '',
        },
        agency: {
            legalName: 'ActiveSet Technologies',
            address: 'B 98, Anjuman Colony, Lower Bazar, Konka Road, Ranchi, Jharkhand, 834001, India',
            signatoryName: '',
            signatoryTitle: 'Partner, ActiveSet',
            email: '',
        },
        effectiveDate: today(),
        retainer: { amount: 0, currency: 'USD', billingCycle: 'monthly' },
        lockInMonths: 0,
        governingLawCountry: 'India',
        jurisdictionCity: 'Bangalore, Karnataka',
        clauses: [],
        ...overrides,
    };
    base.clauses = buildContractClauses(base);
    return base;
}

interface BlankContractCtx {
    clientName?: string;
    agencyName?: string;
    agencySignatoryName?: string;
    agencyEmail?: string;
}

/** Builds a complete draft Proposal record of documentType 'contract'. */
export function buildBlankContract(ctx: BlankContractCtx = {}): Proposal {
    const contract = blankContractData({
        client: {
            legalName: ctx.clientName || '',
            address: '',
            signatoryName: '',
            signatoryTitle: '',
            email: '',
        },
        agency: {
            legalName: ctx.agencyName || 'ActiveSet Technologies',
            address:
                'B 98, Anjuman Colony, Lower Bazar, Konka Road, Ranchi, Jharkhand, 834001, India',
            signatoryName: ctx.agencySignatoryName || '',
            signatoryTitle: 'Partner, ActiveSet',
            email: ctx.agencyEmail || '',
        },
    });

    return {
        id: '',
        documentType: 'contract',
        title: ctx.clientName
            ? `${ctx.clientName} — Retainer Agreement`
            : 'Retainer Agreement',
        clientName: ctx.clientName || '',
        agencyName: ctx.agencyName || 'ActiveSet',
        status: 'draft',
        createdAt: today(),
        updatedAt: today(),
        data: {
            overview: '',
            aboutUs: '',
            pricing: { currency: 'USD', items: [], total: '' },
            timeline: { phases: [] },
            terms: '',
            signatures: {
                agency: {
                    name: ctx.agencySignatoryName || '',
                    email: ctx.agencyEmail || '',
                },
                client: { name: '', email: '' },
            },
            contract,
        },
    };
}

/** Re-export the standard clause headings for the "add clause" picker. */
export const STANDARD_CLAUSE_HEADINGS = STANDARD_CLAUSES.map((c) => ({
    id: c.id,
    heading: c.heading.replace(/&amp;/g, '&'),
}));
