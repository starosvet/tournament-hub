export function register(state, name) {
  const user = {
    id: crypto.randomUUID(),
    name
  };

  state.users.push(user);
  return user;
}
