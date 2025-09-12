import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

def google_login_test(username, password, otp_code):
    """
    Automates the Google login process using Selenium and undetected-chromedriver.

    Args:
        username (str): The Google account email or username.
        password (str): The Google account password.
        otp_code (str): The 6-digit 2FA/OTP code.

    Returns:
        str: 'Success' if login is successful, or 'Failure: [error message]' if it fails.
    """
    driver = None
    try:
        # 1. Initialize the undetected-chromedriver
        # Using a new user data directory for a clean session
        options = uc.ChromeOptions()
        # You can add options here if needed, e.g., options.add_argument('--headless')
        driver = uc.Chrome(options=options)
        
        # Set a generous wait time
        wait = WebDriverWait(driver, 20)

        # 2. Navigate to the Google login page
        driver.get("https://accounts.google.com/signin/v2/identifier")

        # --- Step 1: Enter Username ---
        print("Step 1: Entering username...")
        username_field = wait.until(EC.visibility_of_element_located((By.XPATH, '//*[@id="identifierId"]')))
        username_field.send_keys(username)
        
        next_button_username = driver.find_element(By.XPATH, '//*[@id="identifierNext"]/div/button')
        next_button_username.click()
        
        # --- Step 2: Enter Password ---
        print("Step 2: Entering password...")
        # Wait for the password field to be visible. The element ID might change, so we use a robust XPath.
        password_field = wait.until(EC.visibility_of_element_located((By.XPATH, '//*[@id="password"]/div[1]/div/div[1]/input')))
        password_field.send_keys(password)
        
        next_button_password = driver.find_element(By.XPATH, '//*[@id="passwordNext"]/div/button')
        next_button_password.click()

        # --- Step 3: Enter OTP (2FA) if required ---
        print("Step 3: Checking for 2FA/OTP screen...")
        try:
            # Wait for the OTP input field to appear. The ID is usually 'idvPin'.
            otp_field = wait.until(EC.visibility_of_element_located((By.XPATH, '//*[@id="idvPin"]')))
            print("2FA screen found. Entering OTP code...")
            
            otp_field.send_keys(otp_code)
            
            otp_next_button = driver.find_element(By.XPATH, '//*[@id="idvPreregisteredPhoneNext"]/div/button')
            otp_next_button.click()

        except TimeoutException:
            # This block will be skipped if the OTP screen doesn't appear within the timeout period.
            print("2FA/OTP screen did not appear. It might not be required for this session.")
        
        # --- Step 4: Verify Successful Login ---
        print("Step 4: Verifying login success...")
        # A good way to verify login is to check for the presence of the user's profile icon
        # or wait for a URL that indicates a successful login.
        # We will wait for the Google Apps button which is a reliable post-login element.
        wait.until(EC.presence_of_element_located((By.XPATH, '//a[contains(@aria-label, "Google apps")]')))
        print("Login verification successful!")
        
        return 'Success'

    except TimeoutException as e:
        # This catches errors where an element was not found in time
        error_message = "A timeout occurred waiting for an element."
        print(f"ERROR: {error_message}\nDetails: {e}")
        return f'Failure: {error_message}'
    
    except NoSuchElementException as e:
        # This catches errors where an element locator is incorrect
        error_message = "Could not find an element on the page. The page structure might have changed."
        print(f"ERROR: {error_message}\nDetails: {e}")
        return f'Failure: {error_message}'

    except Exception as e:
        # Generic catch-all for other potential errors
        error_message = f"An unexpected error occurred: {e}"
        print(f"ERROR: {error_message}")
        return f'Failure: {error_message}'

    finally:
        # Ensure the browser is closed even if errors occur
        if driver:
            print("Closing the browser.")
            # time.sleep(5) # Optional: wait 5 seconds to see the final page
            driver.quit()

# --- Example Usage ---
if __name__ == "__main__":
    # Replace with your actual credentials and a valid OTP for testing
    # IMPORTANT: Do not hardcode credentials in production code. Use environment variables or a secure vault.
    TEST_USERNAME = "your_google_email@gmail.com"
    TEST_PASSWORD = "your_google_password"
    # Note: OTP codes are time-sensitive. You need to get a fresh one each time you run the test.
    TEST_OTP = "123456" 

    print(f"--- Starting Google Login Test for user: {TEST_USERNAME} ---")
    result = google_login_test(TEST_USERNAME, TEST_PASSWORD, TEST_OTP)
    print(f"\n--- Test Result ---")
    print(result)
    print("---------------------")
