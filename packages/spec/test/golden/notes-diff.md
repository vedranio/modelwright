### Data model

- Added a description to “User”: “Someone who signs in”.
- Removed attribute “display name” from “User”.
- Renamed entity “Note” to “Memo”.
- Renamed attribute “title” of “Memo” to “heading”.
- Changed the note on attribute “updated at” of “Memo” to “set on every save, in UTC” (was “set on every save”).
- Added attribute “pinned” to “Memo”, noted “shown first”.
- Reordered the attributes of “Memo”: “body”, “heading”, “updated at” and “pinned”.
- Added entity “Tag”, with attribute “name”.
- Each User now writes one or more Memos (was zero or more).
- The relationship from “User” to “Memo” is now labelled “writes” (was “owns”).
- Added a relationship: Each Memo is tagged with zero or more Tags. Each Tag belongs to zero or more Memos.

### Screens and flows

- Renamed state “Error” of “Login” to “Failed”.
- Removed information “password field” from “Login › Failed”.
- Renamed screen “Notes” to “Memos”.
- Added notes to “Memos”: “Home after sign in”.
- Screen “Memos” now uses “Tag”.
- “Memos” now opens in state “Empty” (was “List”).
- Reordered the states of “Memos”: “Empty”, “List” and “Loading”.
- Action “Create your first note” in “Memos › Empty” is now a dead end.
- Added notes to “Memos › List”: “Newest first”.
- Changed information “note titles” in “Memos › List” to “memo titles”.
- Added information “tags” to “Memos › List”.
- Action “Open note” in “Memos › List” is no longer a dead end: it leads to “Note editor”.
- Renamed action “New note” in “Memos › List” to “New memo”.
- Added action “Share” to “Memos › List” (dead end).
- “Open note” is now the primary action in “Memos › List”.
- Reordered the actions in “Memos › List”: “Open note”, “New memo” and “Share”.
- Added state “Loading” to “Memos”.
- Changed information “title field” in “Note editor” to “heading field”.
- Added information “tag picker” to “Note editor”.
- Removed action “Save” from “Note editor”.
- Added screen “Tags”.
- The transition “Sign in” in “Login › Default” → “Memos” is now labelled “success”.
- Removed the transition “Create your first note” in “Memos › Empty” → “Note editor”.
- “Back” in “Note editor” now leads to “Memos › Empty” (was “Memos › List”).
- Added a transition: “Open note” in “Memos › List” → “Note editor”.
- Added a transition: “Back” in “Tags” → “Memos”.

### Config

- Renamed the project “Notes” to “Memos”.
- Changed the preview URL to http://localhost:5174 (was http://localhost:5173).
