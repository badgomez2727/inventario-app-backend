// backend/src/config/roles.js
//
// Única lista blanca de roles que se pueden asignar a un usuario vía la API.
// "super_admin_sistema" NUNCA debe estar aquí: ese rol da acceso a todas las
// compañías del sistema y solo se asigna a mano (ver scripts/set-super-admin.js).
const ASSIGNABLE_ROLES = ['admin_compania', 'empleado_inventario'];

module.exports = { ASSIGNABLE_ROLES };
