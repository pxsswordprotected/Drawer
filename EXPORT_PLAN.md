# Export Feature — Full Plan

## Flow

### Screen 1: Selection
- Triggered by pressing the Export button (separate container from main drawer)
- Export button toggles export mode on/off (press again to exit back to default view)
- At top of container: "Current page" option with checkbox
- Below: every page group and individual highlight has a checkbox to the left
- Checking a page group checks all its highlights
- "Next" button at bottom — greyed out if nothing is selected

### Screen 2: Options
- Back arrow at top to return to selection state (preserves selections)
- Options:
  1. Include notes (toggle)
  2. Include timestamps (toggle)
  3. Copy as markdown OR Download as .md file
- After copy or download: small success state showing "Done"
- Success state auto-dismisses after ~1.5s back to default view
