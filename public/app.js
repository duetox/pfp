let mode = 'qr';
let sessionId = null;
let poller = null;

const connectBtn = document.getElementById('connectBtn');
const uploadBtn = document.getElementById('uploadBtn');
const statusText = document.getElementById('statusText');
const qrImage = document.getElementById('qrImage');
const pairingCode = document.getElementById('pairingCode');
const phoneRow = document.getElementById('phoneRow');

for (const btn of document.querySelectorAll('.segmented-control button')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.segmented-control button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    phoneRow.classList.toggle('hidden', mode !== 'pairing');
  });
}

function setStatus(text) {
  statusText.textContent = `Status: ${text}`;
}

async function pollSession() {
  if (!sessionId) return;
  const res = await fetch(`/api/session/${sessionId}`);
  const data = await res.json();

  setStatus(data.status);

  if (data.qr) {
    qrImage.src = data.qr;
    qrImage.classList.remove('hidden');
  } else {
    qrImage.classList.add('hidden');
  }

  if (data.pairingCode) {
    pairingCode.textContent = data.pairingCode;
    pairingCode.classList.remove('hidden');
  } else {
    pairingCode.classList.add('hidden');
  }
}

connectBtn.addEventListener('click', async () => {
  const phoneInput = document.getElementById('phoneInput').value.trim();
  const body = { mode };
  if (mode === 'pairing') body.phoneNumber = phoneInput;

  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to connect');
    return;
  }

  sessionId = data.sessionId;
  setStatus(data.status);
  if (poller) clearInterval(poller);
  poller = setInterval(pollSession, 2000);
  pollSession();
});

uploadBtn.addEventListener('click', async () => {
  if (!sessionId) {
    alert('Connect WhatsApp first.');
    return;
  }

  const imageInput = document.getElementById('imageInput');
  if (!imageInput.files.length) {
    alert('Please upload an image.');
    return;
  }

  const formData = new FormData();
  formData.append('image', imageInput.files[0]);

  const res = await fetch(`/api/session/${sessionId}/update-pfp`, {
    method: 'POST',
    body: formData
  });
  const data = await res.json();

  if (!res.ok) {
    alert(data.error || 'Update failed');
    return;
  }

  alert('PFP updated successfully!');
});
