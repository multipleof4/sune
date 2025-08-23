// defensive IDB write that matches localforage shape and falls back to alternate put form.
// Assumes openLFDB() returns an open IDB database and STORE_NAME constant exists.

async function writeThreadsToLF(threadsArr) {
  const key = THREADS_KEY; // 'threads_v1'
  // 1) sanitize to ensure structured-cloneable data
  let safeValue;
  try {
    safeValue = JSON.parse(JSON.stringify(threadsArr || []));
  } catch (err) {
    // fallback: attempt to shallow-clone minimal info
    safeValue = (threadsArr || []).map(t => ({
      id: t && t.id,
      title: t && t.title,
      updatedAt: t && t.updatedAt,
      messages: Array.isArray(t && t.messages) ? t.messages.map(m => ({ id: m.id, role: m.role, content: String(m.content || '') })) : []
    }));
  }

  const db = await openLFDB(); // your existing helper
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // Try the localforage-native format first: object with `key` and `value`
  try {
    await new Promise((resolve, reject) => {
      const req = store.put({ key, value: safeValue });
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target?.error || new Error('put(key,value) failed'));
    });
    // success
    await tx.complete?.catch(()=>{}).catch(()=>{}); // noop if not present
    return { ok: true, method: 'put({key,value})' };
  } catch (err1) {
    // fallback: try objectStore.put(value, key)
    try {
      // create a fresh transaction (previous tx is probably aborted)
      const tx2 = db.transaction(STORE_NAME, 'readwrite');
      const store2 = tx2.objectStore(STORE_NAME);
      await new Promise((resolve, reject) => {
        const req = store2.put(safeValue, key);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target?.error || new Error('put(value, key) failed'));
      });
      await tx2.complete?.catch(()=>{}).catch(()=>{});
      return { ok: true, method: 'put(value, key)' };
    } catch (err2) {
      // final fallback: store stringified JSON (always cloneable)
      try {
        const tx3 = db.transaction(STORE_NAME, 'readwrite');
        const store3 = tx3.objectStore(STORE_NAME);
        await new Promise((resolve, reject) => {
          const req = store3.put({ key, value: JSON.stringify(safeValue) });
          req.onsuccess = () => resolve(true);
          req.onerror = (e) => reject(e.target?.error || new Error('put string fallback failed'));
        });
        await tx3.complete?.catch(()=>{}).catch(()=>{});
        return { ok: true, method: 'put({key, value: JSON.stringify(...)})', note: 'value stored as JSON string' };
      } catch (err3) {
        // give up and return the most informative error
        const msg = 'writeThreadsToLF failed: ' + (err3?.message || err2?.message || err1?.message || String(err1));
        throw new Error(msg);
      }
    }
  }
}
