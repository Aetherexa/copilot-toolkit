export class TokenEstimator {
  estimate(text: string): number {
    if (!text) {
      return 0;
    }

    return Math.max(1, Math.ceil(text.length / 4));
  }
}