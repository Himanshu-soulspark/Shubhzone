# bot_worker.py

import sys
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

def google_login_test(username, password, otp_code):
    """
    Automates the Google login process using Selenium and undetected-chromedriver.
    (यह वही फ़ंक्शन है जो पहले प्रदान किया गया था)
    """
    driver = None
    try:
        options = uc.ChromeOptions()
        driver = uc.Chrome(options=options)
        wait = WebDriverWait(driver, 20)
        driver.get("https://accounts.google.com/signin/v2/identifier")

        # Step 1: Username
        print(f"Python: Step 1: Entering username {username}...")
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
        wait.until(EC.presence_of_element_located((By.XPATH, '//a[contains(@aria-label, "Google apps")]')))
        print("Python: Login verification successful!")
        
        return 'Success'

    except Exception as e:
        error_message = f"An unexpected error occurred in Python: {e}"
        print(error_message)
        return f'Failure: {error_message}'

    finally:
        if driver:
            driver.quit()

# --- Main execution block ---
if __name__ == "__main__":
    # sys.argv[0] is the script name itself
    # sys.argv[1] will be the username
    # sys.argv[2] will be the password
    # sys.argv[3] will be the otp_code
    if len(sys.argv) != 4:
        print("Failure: Invalid number of arguments. Expected username, password, and otp.")
        sys.exit(1)

    username_arg = sys.argv[1]
    password_arg = sys.argv[2]
    otp_arg = sys.argv[3]

    print(f"Python: Starting bot for user {username_arg}...")
    
    # Run the test
    result = google_login_test(username_arg, password_arg, otp_arg)
    
    # Print the final result to standard output, so Node.js can capture it
    print(result)
