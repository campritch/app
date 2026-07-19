# Skills

Version-controlled source of truth for Claude skills used by the SpotsNow team. The repo keeps
`.claude/` gitignored, so skills live here and are copied/symlinked into an active skills directory.

## campaign-proposal-generator

The unified advertiser campaign-proposal engine — supersedes the older `proposal-generator`
(general) and `remnant-proposals` (remnant) skills. It powers the generation half of
`spotsnow.wiki/campaign-proposal`:

- **General landscape** and **Last-minute remnant** modes
- **Apollo** revenue → test-budget sizing
- **Competitor-displacement** (build from shows a competitor stopped running on)
- Trained on past proposals (Notion), calls (Fathom), and emails (Superhuman)
- Publishes to the Notion **AI Proposals** index + drafts a **Superhuman** confirmation email

### Activate it

Copy (or symlink) into an active skills directory so Claude discovers it:

```bash
# personal / global
cp -r skills/campaign-proposal-generator ~/.claude/skills/

# or this repo's local dir (gitignored)
mkdir -p .claude/skills && cp -r skills/campaign-proposal-generator .claude/skills/
```

The web front-door (`/campaign-proposal`) produces a run prompt that carries the full job spec;
paste it into Claude (with the SpotsNow, Apollo, Notion, and Superhuman connectors linked) to
generate the proposal.
