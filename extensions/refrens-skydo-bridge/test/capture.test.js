/* Verifies the PDF capture path the extension uses.

   The extension gets its PDF by opening the invoice's Refrens `share.link` in a
   hidden tab and calling Page.printToPDF over the debugger API. Headless Chrome's
   --print-to-pdf drives the exact same code path, so this test reproduces it
   outside the extension: same URL, same print media, same renderer.

   Pass a share link as argv[2]. Get one from any invoice:
     GET https://api.refrens.com/businesses/<urlKey>/invoices/<id>  ->  .share.link
   (Share links are self-authenticating and expire, so none is committed here.) */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const shareLink = process.argv[2];
if (!shareLink) {
  console.error('usage: node test/capture.test.js "<refrens share.link>"');
  process.exit(2);
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = path.join(__dirname, 'captured.pdf');
fs.rmSync(out, { force: true });

execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  '--virtual-time-budget=25000',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'rsb-'))}`,
  `--print-to-pdf=${out}`,
  shareLink
], { stdio: 'ignore' });

const bytes = fs.readFileSync(out);
const fails = [];
if (bytes.slice(0, 5).toString() !== '%PDF-') fails.push('output is not a PDF');
if (bytes.length < 20_000) fails.push(`only ${bytes.length} bytes — the invoice probably did not render`);

// PDFKit is the closest stand-in for whatever parser Skydo runs over the upload.
const swift = path.join(__dirname, '.extract.swift');
fs.writeFileSync(swift, `
import Foundation
import PDFKit
let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
print(doc.pageCount)
print((doc.string ?? "").replacingOccurrences(of: "\\\\s+", with: " ", options: .regularExpression))
`);
const [pageCount, ...rest] = execFileSync('swift', [swift, out], { encoding: 'utf8' }).split('\n');
fs.rmSync(swift, { force: true });
const text = rest.join(' ');

// The three things Skydo's upload dialog demands, plus the identifying fields.
const required = ['Your Company Pvt Ltd', 'United States of America', 'Blog Page Development'];
const identifying = ['INV-0165', 'Acme Holdings', '650.00', 'Authorised Signatory', 'Bank Details'];

console.log(`${bytes.length} bytes · ${pageCount.trim()} page(s) · ${text.length} extractable chars`);
for (const n of [...required, ...identifying]) {
  const hit = text.includes(n);
  console.log(`  ${hit ? '✓' : '✗'} ${n}`);
  if (!hit && required.includes(n)) fails.push(`missing Skydo-required field: ${n}`);
}
if (text.length < 300) fails.push('almost no extractable text — output looks like an image, not a text PDF');

console.log(fails.length ? '\nFAIL\n' + fails.join('\n') : '\nPASS');
process.exit(fails.length ? 1 : 0);
