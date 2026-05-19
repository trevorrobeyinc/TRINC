# Mutual Non-Disclosure Agreement — OpenClaw Research Intelligence

**Template source**: Common Paper Mutual NDA, version 2.0 (https://commonpaper.com/standards/mutual-nda/)
**Operator usage**: Send to every $2,500+ buyer post-purchase, before any sample or full deliverable leaves the inbox.

---

## How to use this in production (operator playbook)

1. Buyer pays via Gumroad → confirmation email arrives at trevor@trevorobeyinc.com.
2. You reply to the buyer using the template in `workspace/templates/first-order-reply.md`.
3. Attach the Common Paper Mutual NDA cover page (downloaded PDF — see "Source download" below).
4. Buyer signs (DocuSign / HelloSign / scanned PDF). Returns within 1 business day per agreement.
5. Once countersigned, you fire the OpenClaw workflow on their topic and ship within 72 hours.

## Source download (canonical PDF)

The Common Paper Mutual NDA is freely licensed under CC BY 4.0 (Common Paper License Agreement at https://commonpaper.com/license/).

**Download steps** (one-time, saves a PDF to disk for future buyer use):

```
curl -L -o /Users/trevorrobey/OpenClaw-Research-Agents/workspace/legal/CommonPaper-Mutual-NDA-v2.pdf "https://commonpaper.com/s/Common-Paper-Mutual-NDA-Cover-Page-2.0.pdf"
```

If that URL changes, get the latest from https://commonpaper.com/standards/mutual-nda/ — they keep the PDF + DOCX side-by-side.

## Cover Page — fill these fields per-buyer

The Common Paper Cover Page is the only thing you fill in; the Standard Terms attached are the legal instrument.

| Field | Default value | Notes |
|---|---|---|
| Effective Date | (date of buyer's payment) | YYYY-MM-DD format |
| Disclosing Party 1 | Trevor Robey Inc. d/b/a OpenClaw Research Intelligence | Your legal entity |
| Disclosing Party 1 Address | (your registered agent address) | NOT your home address — use the LLC registered agent |
| Disclosing Party 1 Notice Email | trevor@trevorobeyinc.com | |
| Disclosing Party 2 | (buyer's legal entity name) | Get from the buyer's email signature or ask explicitly |
| Disclosing Party 2 Address | (provided by buyer) | |
| Disclosing Party 2 Notice Email | (provided by buyer) | |
| Confidentiality Period | 3 years from disclosure | Common Paper default; raise to 5 if buyer requests |
| Permitted Purpose | "Evaluation and use of OpenClaw biomedical research deliverables; Receiving Party's analytical, strategic, and competitive-intelligence work product." | Use verbatim or close to it |
| Governing Law | State of Trevor Robey Inc. registration (e.g., Delaware) | |
| Dispute Resolution | Binding arbitration, AAA Commercial Arbitration Rules | Default for solo-operator scale |

## Standard Terms (attached, do not modify)

Common Paper Standard Terms attached separately. Do not redline — Common Paper terms are widely accepted; redlining defeats the speed advantage. If a buyer insists on changes, escalate to counsel before signing.

## Red flags to refuse before signing

- Buyer wants you to sign their custom 20-page NDA instead → counter with Common Paper, cite "we use the standardized template to keep things moving for both sides."
- Indemnification clauses asking you to indemnify them for IP infringement → strike. You're delivering public-domain-cited research; you cannot indemnify against use cases you don't control.
- Confidentiality period >5 years → push back. 3-year default is industry-standard for trade-secret-grade info; biomedical research synthesis doesn't warrant longer.
- Liquidated damages clauses → strike. Common Paper standard remedies are sufficient.
- Non-compete language → strike. NDAs aren't non-competes.

## At-rest storage

Counter-signed NDAs go in `workspace/legal/executed/` with filename pattern `YYYY-MM-DD_<buyer-entity>_NDA.pdf`. Reference the buyer's NDA filename in the audit log of every deliverable you ship them.

---

*This file is a procedural reference. The actual legal instrument is the Common Paper PDF + Cover Page. Do not paste the body of this markdown into a buyer-facing email — use `workspace/templates/first-order-reply.md` for that.*
