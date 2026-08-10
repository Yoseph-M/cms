import { hashPassword } from '../src/utils/security';

async function main() {
    const password = 'password123';
    const hash = await hashPassword(password);
    console.log('Password hash for', password, ':');
    console.log(hash);
}

main().catch(console.error);