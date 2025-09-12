# bot/bot_worker.py

import sys
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

def google_login_test(username, password, otp_code):
    driver = None
    try:
        options = webdriver.ChromeOptions()
        # --- मेमोरी बचाने के लिए यह अंतिम और अत्यावश्यक बदलाव हैं ---
        options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument("--disable-extensions")
        options.add_argument("--blink-settings=imagesEnabled=false") # इमेज लोड न करें
        # -----------------------------------------------------------
        
        driver = webdriver.Chrome(options=options)
        
        wait = WebDriverWait(driver, 30)
        driver.get("https://accounts.google.com/signin/v2/identifier")

        # Step 1: Username
        print("Python: Step 1: Entering username...")
        username_field = wait.until(EC.visibility_of_element_located((By.XPATH, '//*[@id="identifierId"]')))
        username_field.send_keys(username)
        driver.find_element(By.XPATH, '//*[@id="identifierNext"]/div/button').click()
        
        # Step 2: Password
        print("Python: Step 2: Entering password...")
        password_field = wait.until(EC.visibility_of_element_located((By.XPATH, '//*[@id="password"]/div[1]/div/div[1]/input')))
        password_field.send_keys(password)
        driver.find_element(By.XPATH, '//*[@id="passwordNext"]/div/button').click()

        # Step 3: OTP
        print("Python: Step 3: Checking for 2FA/OTP screen...")
        try:
            otp_field = wait.until(EC.visibility_of_element_located((By.XPATH, '//*[@id="idvPin"]')))
            print("Python: 2FA screen found. Entering OTP code...")
            otp_field.send_keys(otp_code)
            driver.find_element(By.XPATH, '//*[@id="idvPreregisteredPhoneNext"]/div/button').click()
        except TimeoutException:
            print("Python: 2FA/OTP screen did not appear.")
        
        # Step 4: Verify
        print("Python: Step 4: Verifying login success...")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, 'a[href^="https://myaccount.google.com/"]')))
        print("Python: Login verification successful!")
        
        return 'Success'

    except Exception as e:
        error_message = f"An unexpected error occurred in Python: {e}"
        print(error_message)
        # मेमोरी की समस्या को पकड़ने के लिए विशेष संदेश
        if "session deleted because of page crash" in str(e) or "target crashed" in str(e):
            print("Failure: Browser crashed, likely due to low memory on the server.")
        return f'Failure: {error_message}'

    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Failure: Invalid number of arguments.")
        sys.exit(1)
    username_arg = sys.argv[1]
    password_arg = sys.argv[2]
    otp_arg = sys.argv[3]
    print(f"Python: Starting bot for user {username_arg}...")
    result = google_login_test(username_arg, password_arg, otp_arg)
    print(result)
