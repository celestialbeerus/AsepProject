from flask import Flask, request, jsonify
import requests
from lxml import html
import random
from fake_useragent import UserAgent
import time
import json

app = Flask(__name__)

def scrape_elements(url, xpath):
    # Create a random User-Agent
    ua = UserAgent()
    headers = {'User-Agent': ua.random}

    # Add a random delay between requests (between 1 and 5 seconds)
    delay = random.uniform(1, 5)
    time.sleep(delay)

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()  # Raise an exception for non-2xx status codes
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
        return []


    if response.status_code == 200:
        parser = html.fromstring(response.text)
        elements = parser.xpath(xpath)
        return elements
    else:
        print(f"Failed to fetch data. Status code: {response.status_code}")
        return []


def scrape_linkedin_company(company_id):
    url = company_id

    # Create a random User-Agent
    ua = UserAgent()
    headers = {'User-Agent': ua.random}

    # Add a random delay between requests (between 1 and 5 seconds)
    delay = random.uniform(1, 5)
    time.sleep(delay)

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()  # Raise an exception for non-2xx status codes
    except requests.exceptions.RequestException as e:
        print(f"Error fetching company data: {e}")
        return {"error": str(e)}

    if response.status_code == 200:
        parser = html.fromstring(response.text)
        company_data = {}

        # Include URL
        company_data['url'] = url

        # Company Name
        company_name = parser.xpath('//*//*[@id="main-content"]/section[1]/section/div/div[2]/div[1]/h1/text()')
        company_data['companyName'] = company_name[0].strip() if company_name else ""

        # About Us
        about_us = parser.xpath('//*//*[@id="main-content"]/section[1]/div/section[1]/div/p/text()')
        company_data['about'] = about_us[0].strip() if about_us else ""

        # Other details
        xpaths = [
            '//*//*[@id="main-content"]/section[1]/div/section[1]/div/dl/div[1]',  # Website
            '//*//*[@id="main-content"]/section[1]/div/section[1]/div/dl/div[2]',  # Industry
            '//*//*[@id="main-content"]/section[1]/div/section[1]/div/dl/div[3]',  # Company Size
            '//*//*[@id="main-content"]/section[1]/div/section[1]/div/dl/div[4]',  # Headquarters
            '//*//*[@id="main-content"]/section[1]/div/section[1]/div/dl/div[5]',  # Founded
            '//*//*[@id="main-content"]/section[1]/div/section[1]/div/dl/div[6]',  # Type
            '//*//*[@id="main-content"]/section[1]/div/section[1]/div/dl/div[7]',  # Specialties
            '/html/body/main/section[1]/div/section[1]/div/dl/div[1]/dd/a'  # Website XPath
        ]

        for xpath in xpaths:
            if xpath != '/html/body/main/section[1]/div/section[1]/div/dl/div[1]/dd/a':
                category_element = parser.xpath(f'{xpath}/dt/text()')
                value_element = parser.xpath(f'{xpath}/dd/text()')
                if category_element and value_element:
                    category = category_element[0].strip()
                    value = value_element[0].strip()
                    camel_case_key = category.replace(" ", "").lower()
                    if camel_case_key == 'companysize':
                        camel_case_key = 'companySize'
                    company_data[camel_case_key] = value
            elif xpath == '/html/body/main/section[1]/div/section[1]/div/dl/div[1]/dd/a':
                website_element = parser.xpath(xpath)
                if website_element:
                    company_data['website'] = website_element[0].get('href')

        # Extract avatar URL using data_delayed_url attribute
        xpath = '//*[@id="main-content"]/section[1]/section/div/div[1]/img'
        all_elements = scrape_elements(url, xpath)
        for element in all_elements:
            data_delayed_url = element.get('data-delayed-url')
            company_data['avatarUrl'] = data_delayed_url if data_delayed_url else ''

        return company_data
    else:
        return {"error": f"Failed to fetch company data. Status code: {response.status_code}"}


@app.route('/scrape_linkedin_company', methods=['POST'])
def scrape_company():
    data = request.get_json()
    url = data.get('url')
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    company_details = scrape_linkedin_company(url)
    return jsonify(company_details)


if __name__ == '__main__':
    app.run(debug=True)
