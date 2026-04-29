export const signupRules = {
  username: ['required', 'string', 'min:5', 'max:24', 'username_format'],
  email: ['required', 'string', 'email'],
  password: ['required', 'string', 'min:8'],
};
