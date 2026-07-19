// Campaign-proposal job API.
// Actions: create | list | get | update | delete
// Password-gated via STRATEGY_PASSWORD (same gate as the KB + strategy tools).
//
// The web front-door (/campaign-proposal) creates and lists jobs. The Claude
// `campaign-proposal-generator` skill reads a job (get), and writes the Notion
// URL + status back (update) once the proposal is generated.

import { listJobs, getJob, createJob, updateJob, deleteJob } from './_tools/proposal-jobs.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const expected = process.env.STRATEGY_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'STRATEGY_PASSWORD not configured' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });

  const { password, action, id, job, patch, created_by } = req.body || {};
  if (password !== expected) return res.status(401).json({ error: 'bad password' });

  try {
    if (action === 'list') return res.status(200).json(await listJobs());
    if (action === 'get') {
      if (!id) return res.status(400).json({ error: 'id required' });
      return res.status(200).json(await getJob({ id }));
    }
    if (action === 'create') {
      if (!job) return res.status(400).json({ error: 'job required' });
      return res.status(200).json(await createJob({ job, created_by }));
    }
    if (action === 'update') {
      if (!id) return res.status(400).json({ error: 'id required' });
      return res.status(200).json(await updateJob({ id, patch }));
    }
    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'id required' });
      return res.status(200).json(await deleteJob({ id }));
    }
    return res.status(400).json({ error: 'action must be create | list | get | update | delete' });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

export const config = { maxDuration: 30 };
