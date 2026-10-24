let skills = [];

function loadProfile() {
  const savedProfile = localStorage.getItem('hackmate-profile');
  if (savedProfile) {
    const profile = JSON.parse(savedProfile);
    document.getElementById('profile-name').value = profile.name || '';
    document.getElementById('profile-bio').value = profile.bio || '';
    document.getElementById('profile-experience').value = profile.experience || '';
    skills = profile.skills || [];
    renderSkills();
    updateCharCount();
  }
}

function saveProfile() {
  const profile = {
    name: document.getElementById('profile-name').value.trim(),
    bio: document.getElementById('profile-bio').value.trim(),
    experience: document.getElementById('profile-experience').value,
    skills: skills
  };
  localStorage.setItem('hackmate-profile', JSON.stringify(profile));
}

function addSkill(skill) {
  skill = skill.trim().toLowerCase();
  if (skill && !skills.includes(skill)) {
    skills.push(skill);
    renderSkills();
  }
}

function removeSkill(skill) {
  skills = skills.filter(s => s !== skill);
  renderSkills();
}

function renderSkills() {
  const container = document.getElementById('skill-tags');
  container.innerHTML = '';
  skills.forEach(skill => {
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.textContent = skill;
    tag.onclick = () => removeSkill(skill);
    container.appendChild(tag);
  });
}

function updateCharCount() {
  const bio = document.getElementById('profile-bio');
  const count = document.querySelector('.char-count');
  count.textContent = `${bio.value.length}/500`;
}

function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = document.getElementById('profile-name').value.trim();
  const bio = document.getElementById('profile-bio').value.trim();
  const experience = document.getElementById('profile-experience').value;

  if (!name || !experience) {
    alert('Please fill in all required fields.');
    return;
  }

  saveProfile();
  const successMessage = document.querySelector('.success-message');
  successMessage.classList.add('visible');
  setTimeout(() => successMessage.classList.remove('visible'), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();

  document.getElementById('add-skill-btn').addEventListener('click', () => {
    const input = document.getElementById('skill-input');
    addSkill(input.value);
    input.value = '';
  });

  document.getElementById('skill-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSkill(e.target.value);
      e.target.value = '';
    }
  });

  document.getElementById('profile-bio').addEventListener('input', updateCharCount);

  document.getElementById('profile-form').addEventListener('submit', handleFormSubmit);
});