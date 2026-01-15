declare module "htmldiff-js" {
  /**
   * HtmlDiff class that computes the diff between two HTML strings.
   */
  class HtmlDiff {
    constructor(before: string, after: string);
    /**
     * Build and return the diff HTML with <ins> and <del> tags.
     */
    build(): string;
  }
  export default HtmlDiff;
}
