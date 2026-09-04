# Intake schema

Every field in `intake/*.json`, and the manager-guide question it maps to.

| Field | Manager-guide question |
|---|---|
| `company` | What's the company you work for? |
| `teamName` | What do you call this team, and who's on it? |
| `headcount` | How many people are on the team? |
| `function` (`ops`\|`gtm`) | Is this team's work closer to operations or go-to-market? |
| `stack` (array of tool names on the team's seats) | What tools does everyone on the team actually have a seat for today? |
| `sopName` | What do you call this workflow internally? |
| `sopSummary` (3-6 sentences of the current pre-AI workflow) | Walk me through how this gets done today, step by step, before any AI touches it. |
| `pain` (one sentence in the manager's words) | In one sentence, what's the thing about this that's actually costing you? |
| `deadline` (what changes and by when) | What has to be different, and by when? |
| `offLimits` (array) | Is there anything that's off the table no matter what, data that can't move, a system that can't change? |
| `closedLevers` (array of options already ruled out, each with a one-line reason) | What have you already tried or considered and ruled out, and why? |
| `theme` (`automation`\|`dashboard`\|`research`) | If this got fixed, would it look more like something running on its own, something you can see at a glance, or something someone had to go dig up? |
| `pairs` (array of [nameA, nameB]) | Who on the team would you naturally pair up for something like this? |
| `tiers` (object, name -> `cautious`\|`confident`) | For each person, would you call them more cautious or more confident about trying something new with AI? |
| `managerName` | And your name, for the record? |
| `managerRole` | What's your title? |
| `eventDate` (ISO) | What date works for the live session? |
| `leadUpStart` (ISO, the Monday before) | What's the Monday before that date, so we know when the lead-up week starts? |
