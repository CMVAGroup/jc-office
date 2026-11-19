// CS Manager — task type cs_review
// Input: a cs_draft result plus the original ticket context.
// Output: CsReviewSchema — improved body, change log, approval flag.

export interface CsReviewInput {
  ticketId: string;
  inboundMessageId: string;
  subject: string;
  originalBody: string;
  draftBody: string;
  tone: string;
  reasoning: string;
  knowledgeContext?: import('../cs-medewerker').CsKnowledgeSnippet[];
}
