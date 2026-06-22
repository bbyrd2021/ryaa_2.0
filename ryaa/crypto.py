import os

from cryptography.fernet import Fernet


def _fernet() -> Fernet:
    # read the key lazily (not an import) so  load_dotenv() has already run
    return Fernet(os.environ["CREDENTIALS_ENC_KEY"])


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
