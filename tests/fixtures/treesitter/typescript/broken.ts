// Deliberate syntax error to exercise parse_status='partial'.
// Missing closing brace on the class body.

export class Broken {
  method() {
    return "incomplete"
// EOF before class close