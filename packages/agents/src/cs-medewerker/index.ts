// CS Medewerker — task type cs_draft
// Input: one open support ticket from the CMVA inbox.
// Output: CsDraftSchema — a draft reply ready for manager review.

export interface CsKnowledgeSnippet {
  slug: string;
  title: string;
  body: string;
}

export interface CsDraftInput {
  ticketId: string;
  inboundMessageId: string;
  subject: string;
  body: string;
  knowledgeContext?: CsKnowledgeSnippet[];
}
