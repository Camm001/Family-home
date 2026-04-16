PAGE_RENDERERS.admin = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header"><h2>Admin</h2></div>
    <div id="admin-root"><p class="text-muted">Loading...</p></div>`;

  try {
    const [users, invites] = await Promise.all([
      App.api('/users'),
      App.api('/auth/invites')
    ]);

    document.getElementById('admin-root').innerHTML = `
      <!-- Users -->
      <div class="admin-section">
        <h3>Family Members (${users.length})</h3>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th>
            </tr></thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:.5rem">
                      <span class="user-avatar" style="background:${escHtml(u.color||'#2383e2')};width:1.5rem;height:1.5rem;font-size:.75rem">${escHtml(u.name[0].toUpperCase())}</span>
                      ${escHtml(u.name)}
                      ${u.id === App.user.id ? '<span class="badge badge-blue" style="margin-left:.25rem">You</span>' : ''}
                    </div>
                  </td>
                  <td class="text-muted text-sm">${escHtml(u.email)}</td>
                  <td>
                    <select class="role-select" data-uid="${u.id}" style="width:auto" ${u.id === App.user.id ? 'disabled' : ''}>
                      <option value="admin"  ${u.role==='admin'  ?'selected':''}>Admin</option>
                      <option value="member" ${u.role==='member' ?'selected':''}>Member</option>
                      <option value="child"  ${u.role==='child'  ?'selected':''}>Child</option>
                    </select>
                  </td>
                  <td class="text-muted text-sm">${new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    ${u.id !== App.user.id ? `<button class="btn btn-danger btn-sm delete-user-btn" data-uid="${u.id}" data-name="${escHtml(u.name)}">Remove</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Invites -->
      <div class="admin-section">
        <h3>Invite Links</h3>
        <button id="gen-invite-btn" class="btn btn-primary btn-sm">+ Generate Invite Link</button>
        <div id="invite-result"></div>
        ${invites.length > 0 ? `
          <div class="table-wrap" style="margin-top:1rem">
            <table>
              <thead><tr><th>Token</th><th>Created by</th><th>Expires</th><th></th></tr></thead>
              <tbody id="invite-list">
                ${invites.map(inv => `
                  <tr>
                    <td class="text-sm text-muted" style="font-family:monospace">${escHtml(inv.token.slice(0,16))}…</td>
                    <td class="text-sm">${escHtml(inv.created_by_name)}</td>
                    <td class="text-sm text-muted">${new Date(inv.expires_at).toLocaleString()}</td>
                    <td><button class="btn btn-ghost btn-sm revoke-btn" data-token="${escHtml(inv.token)}">Revoke</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p class="text-muted text-sm" style="margin-top:.75rem">No pending invites.</p>'}
      </div>

      <!-- Stats -->
      <div class="admin-section">
        <h3>App Stats</h3>
        <div id="admin-stats" class="dash-grid" style="max-width:640px">
          <p class="text-muted text-sm">Loading...</p>
        </div>
      </div>
    `;

    // Role change
    document.querySelectorAll('.role-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        try {
          await App.api(`/users/${sel.dataset.uid}/role`, { method: 'PUT', body: { role: sel.value } });
          App.toast('Role updated', 'success');
        } catch (e) { App.toast(e.message, 'error'); }
      });
    });

    // Delete user
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Remove ${btn.dataset.name} from Family Hub?`)) return;
        try {
          await App.api(`/users/${btn.dataset.uid}`, { method: 'DELETE' });
          App.toast('User removed', 'success');
          PAGE_RENDERERS.admin();
        } catch (e) { App.toast(e.message, 'error'); }
      });
    });

    // Generate invite
    document.getElementById('gen-invite-btn').addEventListener('click', async () => {
      try {
        const data = await App.api('/auth/invite', { method: 'POST' });
        const url = `${location.origin}/#register?token=${data.token}`;
        document.getElementById('invite-result').innerHTML = `
          <div class="invite-url-box">
            <span style="flex:1;word-break:break-all">${escHtml(url)}</span>
            <button class="btn btn-ghost btn-sm" id="copy-invite-btn">Copy</button>
          </div>
          <p class="text-muted text-sm" style="margin-top:.375rem">Expires ${new Date(data.expires_at).toLocaleString()}</p>`;
        document.getElementById('copy-invite-btn').addEventListener('click', () => {
          navigator.clipboard.writeText(url);
          App.toast('Copied to clipboard!', 'success');
        });
      } catch (e) { App.toast(e.message, 'error'); }
    });

    // Revoke invite
    document.querySelectorAll('.revoke-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await App.api(`/auth/invites/${btn.dataset.token}`, { method: 'DELETE' });
          btn.closest('tr').remove();
          App.toast('Invite revoked', 'success');
        } catch (e) { App.toast(e.message, 'error'); }
      });
    });

    // Stats
    try {
      const [eventsData, expensesData] = await Promise.all([
        App.api('/calendar?start=2000-01-01&end=2099-12-31'),
        App.api('/expenses')
      ]);
      const totalSpend = expensesData.reduce((s, e) => s + (e.amount || 0), 0);
      document.getElementById('admin-stats').innerHTML = `
        <div class="card"><div class="card-title">Members</div><div class="dash-stat-value">${users.length}</div></div>
        <div class="card"><div class="card-title">Calendar Events</div><div class="dash-stat-value">${eventsData.length}</div></div>
        <div class="card"><div class="card-title">Total Expenses</div><div class="dash-stat-value">$${totalSpend.toFixed(0)}</div></div>
      `;
    } catch { document.getElementById('admin-stats').innerHTML = '<p class="text-muted text-sm">Stats unavailable</p>'; }

  } catch (e) {
    document.getElementById('admin-root').innerHTML = `<p class="text-danger">Error loading admin panel: ${escHtml(e.message)}</p>`;
  }
};
