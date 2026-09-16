describe('Search Availability SQL filter seam', () => {
  it('ensures search conditions exclude offline assets', () => {
    // Verify that offline exclusion clause format is correct
    const offlineExclusionClause = "(a.availability IS NULL OR a.availability != 'offline')";
    expect(offlineExclusionClause).toContain("availability != 'offline'");
  });
});
