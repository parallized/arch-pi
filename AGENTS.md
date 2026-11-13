# Agent Guidelines

## Code Search (Windows / PowerShell)

- **Do NOT use `rg -n` (ripgrep)** in this workspace — it hangs or stalls in this environment.
- Instead, use PowerShell `Get-ChildItem` + `Select-String` scoped to source directories (e.g., `apps\desktop\src`, `packages\*\src`) to avoid scanning `node_modules`:
  ```powershell
  Get-ChildItem -Path apps\desktop\src, packages\agent-runtime\src, packages\shared\src -Recurse -File -Include *.ts,*.tsx | Select-String -Pattern "<pattern>"
  ```
