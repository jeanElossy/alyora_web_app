/**
 * Joint des classes CSS en ignorant les valeurs vides : cx('a', condition && 'b').
 *
 * @param {...(string | false | null | undefined)} classes
 * @returns {string}
 */
export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}
