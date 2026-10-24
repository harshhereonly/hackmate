function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setError(input, message) {
  const wrapper = input.closest('.form-group');
  if (!wrapper) return;
  const errorEl = wrapper.querySelector('.error-message');
  errorEl.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  input.classList.add('input-error');
}

function clearError(input) {
  const wrapper = input.closest('.form-group');
  if (!wrapper) return;
  const errorEl = wrapper.querySelector('.error-message');
  errorEl.textContent = '';
  input.removeAttribute('aria-invalid');
  input.classList.remove('input-error');
}

function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const emailInput = form.querySelector('[name="email"]');
  const passwordInput = form.querySelector('[name="password"]');
  const confirmInput = form.querySelector('[name="confirmPassword"]');
  const submitBtn = form.querySelector('button[type="submit"]');
  let isValid = true;

  clearError(emailInput);
  clearError(passwordInput);
  if (confirmInput) clearError(confirmInput);

  if (!emailInput.value.trim()) {
    setError(emailInput, 'Email is required.');
    isValid = false;
  } else if (!validateEmail(emailInput.value.trim())) {
    setError(emailInput, 'Please enter a valid email address.');
    isValid = false;
  }

  if (!passwordInput.value) {
    setError(passwordInput, 'Password is required.');
    isValid = false;
  } else if (passwordInput.value.length < 8) {
    setError(passwordInput, 'Password must be at least 8 characters.');
    isValid = false;
  }

  if (confirmInput) {
    if (!confirmInput.value) {
      setError(confirmInput, 'Please confirm your password.');
      isValid = false;
    } else if (confirmInput.value !== passwordInput.value) {
      setError(confirmInput, 'Passwords do not match.');
      isValid = false;
    }
  }

  if (!isValid) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';

  setTimeout(() => {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Continue';
    const successMessage = form.querySelector('.success-message');
    if (successMessage) {
      successMessage.classList.add('visible');
    }
  }, 900);
}

function initAuthForms() {
  document.querySelectorAll('.auth-form').forEach((form) => {
    form.addEventListener('submit', handleFormSubmit);

    form.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => clearError(input));
    });
  });
}

document.addEventListener('DOMContentLoaded', initAuthForms);
