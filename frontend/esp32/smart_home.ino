#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

#define DHTPIN 4
#define DHTTYPE DHT22

const char* ssid = "Wokwi-GUEST";
const char* password = "";

const char* mqttBroker = "broker.hivemq.com";
const int mqttPort = 1883;

const char* topicSensorsData = "smarthome/sensors/data";
const char* topicDevicesStatus = "smarthome/devices/status";
const char* topicAlerts = "smarthome/alerts";
const char* topicModeControl = "smarthome/mode/control";
const char* topicDevicesControl = "smarthome/devices/control";

const int mq2Pin = 34;
const int ldrPin = 35;
const int rainPin = 18;
const int pirPin = 19;

const int lampPin = 2;
const int awningPin = 5;
const int securityAlarmPin = 16;
const int gasAlarmPin = 17;
const int fanPin = 21;
const int windowPin = 22;
const int dehumidifierPin = 23;
const int gasValvePin = 25;

const int gasThreshold = 2000;
const int lightThreshold = 2000;
const float humidityThreshold = 70.0;
const float tempThreshold = 35.0;

const unsigned long publishInterval = 3000;
const unsigned long debounceDelay = 200;

DHT dht(DHTPIN, DHTTYPE);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

String currentMode = "auto";

int gasValue = 0;
int lightValue = 0;
int rain = 0;
int motion = 0;
int lamp = 0;
int awning = 0;
int window = 0;
int fan = 0;
int dehumidifier = 0;
int securityAlarm = 0;
int gasAlarm = 0;
int gasValve = 1;
int gasWarning = 0;
int tempWarning = 0;

float temperature = 0;
float humidity = 0;

bool rainStatus = false;
int lastRainReading = HIGH;
int stableRainReading = HIGH;
unsigned long lastRainChangeMillis = 0;
unsigned long lastPublishMillis = 0;

bool previousGasAlert = false;
bool previousRainAlert = false;
bool previousTempAlert = false;
bool previousMotionAlert = false;

void writeLedStates() {
  digitalWrite(lampPin, lamp ? HIGH : LOW);
  digitalWrite(awningPin, awning ? HIGH : LOW);
  digitalWrite(windowPin, window ? HIGH : LOW);
  digitalWrite(fanPin, fan ? HIGH : LOW);
  digitalWrite(dehumidifierPin, dehumidifier ? HIGH : LOW);
  digitalWrite(securityAlarmPin, securityAlarm ? HIGH : LOW);
  digitalWrite(gasAlarmPin, gasAlarm ? HIGH : LOW);
  digitalWrite(gasValvePin, gasValve ? HIGH : LOW);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("WiFi connected: ");
  Serial.println(WiFi.localIP());
}

void publishDeviceStatus() {
  StaticJsonDocument<512> doc;
  doc["lamp"] = lamp;
  doc["awning"] = awning;
  doc["window"] = window;
  doc["fan"] = fan;
  doc["dehumidifier"] = dehumidifier;
  doc["securityAlarm"] = securityAlarm;
  doc["gasAlarm"] = gasAlarm;
  doc["gasValve"] = gasValve;
  doc["mode"] = currentMode;

  char payload[512];
  serializeJson(doc, payload);
  mqttClient.publish(topicDevicesStatus, payload);

  Serial.print("Publish devices/status: ");
  Serial.println(payload);
}

void syncAutomaticDeviceStates() {
  lamp = lightValue < lightThreshold ? 1 : 0;
  awning = rain;
  window = rain ? 1 : 0;
  fan = tempWarning;
  dehumidifier = humidity > humidityThreshold ? 1 : 0;
  securityAlarm = motion;
  gasAlarm = gasWarning;
  gasValve = gasWarning ? 0 : 1;
}

void applyOutputStates() {
  if (currentMode == "auto") {
    syncAutomaticDeviceStates();
  }

  if (gasWarning == 1) {
    gasValve = 0;
  }

  writeLedStates();
}

int readBinary(JsonDocument& doc, const char* field) {
  return doc[field].as<int>() >= 1 ? 1 : 0;
}

void logBlockedControl(const char* field, const char* reason) {
  Serial.print("Blocked ");
  Serial.print(field);
  Serial.print(": ");
  Serial.println(reason);
}

void applyDeviceControl(JsonDocument& doc) {
  if (currentMode != "manual") {
    Serial.println("Ignored devices/control because mode is auto");
    return;
  }

  bool recognized = false;

  if (doc.containsKey("lamp")) {
    lamp = readBinary(doc, "lamp");
    recognized = true;
  }

  if (doc.containsKey("awning")) {
    recognized = true;

    if (rain == 1) {
      awning = readBinary(doc, "awning");
    } else {
      logBlockedControl("awning", "rain warning is not active");
    }
  }

  if (doc.containsKey("window")) {
    recognized = true;

    if (rain == 1) {
      window = readBinary(doc, "window");
    } else {
      logBlockedControl("window", "rain warning is not active");
    }
  }

  if (doc.containsKey("fan")) {
    recognized = true;

    if (tempWarning == 1) {
      fan = readBinary(doc, "fan");
    } else {
      logBlockedControl("fan", "temperature warning is not active");
    }
  }

  if (doc.containsKey("dehumidifier")) {
    recognized = true;

    if (humidity > humidityThreshold) {
      dehumidifier = readBinary(doc, "dehumidifier");
    } else {
      logBlockedControl("dehumidifier", "humidity warning is not active");
    }
  }

  if (doc.containsKey("securityAlarm")) {
    recognized = true;

    if (motion == 1) {
      securityAlarm = readBinary(doc, "securityAlarm");
    } else {
      logBlockedControl("securityAlarm", "motion warning is not active");
    }
  }

  if (doc.containsKey("gasValve")) {
    recognized = true;
    int nextGasValve = readBinary(doc, "gasValve");

    if (gasWarning == 1 && nextGasValve == 1) {
      Serial.println("Blocked gas valve open because gas warning is active");
    } else {
      gasValve = nextGasValve;
    }
  }

  if (doc.containsKey("gasAlarm")) {
    recognized = true;

    if (gasWarning == 1 && gasValve == 0) {
      gasAlarm = readBinary(doc, "gasAlarm");
    } else if (gasWarning == 1) {
      logBlockedControl("gasAlarm", "gas valve is not locked yet");
    } else {
      logBlockedControl("gasAlarm", "gas warning is not active");
    }
  }

  if (!recognized) {
    Serial.println("Ignored devices/control because no supported device field was found");
    return;
  }

  applyOutputStates();
  publishDeviceStatus();
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.print("MQTT JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  String topicName = String(topic);

  if (topicName == topicModeControl) {
    const char* nextMode = doc["mode"] | "auto";

    if (strcmp(nextMode, "manual") == 0) {
      currentMode = "manual";
    } else {
      currentMode = "auto";
    }

    applyOutputStates();
    Serial.print("Mode changed to: ");
    Serial.println(currentMode);
    publishDeviceStatus();
    return;
  }

  if (topicName == topicDevicesControl) {
    applyDeviceControl(doc);
  }
}

void connectMqtt() {
  while (!mqttClient.connected()) {
    String clientId = "esp32-smarthome-";
    clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

    Serial.print("Connecting MQTT...");

    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected");
      mqttClient.subscribe(topicModeControl);
      mqttClient.subscribe(topicDevicesControl);
      Serial.println("Subscribed control topics");
      publishDeviceStatus();
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retry in 2 seconds");
      delay(2000);
    }
  }
}

void updateRainToggle() {
  int reading = digitalRead(rainPin);

  if (reading != lastRainReading) {
    lastRainChangeMillis = millis();
    lastRainReading = reading;
  }

  if (millis() - lastRainChangeMillis > debounceDelay) {
    if (reading != stableRainReading) {
      stableRainReading = reading;

      if (stableRainReading == LOW) {
        rainStatus = !rainStatus;
      }
    }
  }

  rain = rainStatus ? 1 : 0;
}

void readSensors() {
  gasValue = analogRead(mq2Pin);
  lightValue = analogRead(ldrPin);
  motion = digitalRead(pirPin) == HIGH ? 1 : 0;
  rain = rainStatus ? 1 : 0;

  float nextTemperature = dht.readTemperature();
  float nextHumidity = dht.readHumidity();

  if (!isnan(nextTemperature)) temperature = nextTemperature;
  if (!isnan(nextHumidity)) humidity = nextHumidity;

  gasWarning = gasValue > gasThreshold ? 1 : 0;
  tempWarning = temperature > tempThreshold ? 1 : 0;
}

void publishSensorData() {
  StaticJsonDocument<512> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["gas"] = gasValue;
  doc["light"] = lightValue;
  doc["rain"] = rain;
  doc["motion"] = motion;
  doc["lamp"] = lamp;
  doc["awning"] = awning;
  doc["window"] = window;
  doc["fan"] = fan;
  doc["dehumidifier"] = dehumidifier;
  doc["securityAlarm"] = securityAlarm;
  doc["gasAlarm"] = gasAlarm;
  doc["gasValve"] = gasValve;
  doc["gasWarning"] = gasWarning;
  doc["tempWarning"] = tempWarning;
  doc["mode"] = currentMode;

  char payload[512];
  serializeJson(doc, payload);
  mqttClient.publish(topicSensorsData, payload);

  Serial.print("Publish sensors/data: ");
  Serial.println(payload);
}

void publishAlert(const char* type, const char* message, float value) {
  StaticJsonDocument<256> doc;
  doc["type"] = type;
  doc["message"] = message;
  doc["value"] = value;

  char payload[256];
  serializeJson(doc, payload);
  mqttClient.publish(topicAlerts, payload);

  Serial.print("Publish alert: ");
  Serial.println(payload);
}

void publishAlertsWhenNeeded() {
  bool currentGasAlert = gasWarning == 1;
  bool currentRainAlert = rain == 1;
  bool currentTempAlert = tempWarning == 1;
  bool currentMotionAlert = motion == 1;

  if (currentGasAlert && !previousGasAlert) {
    publishAlert("gas", "Canh bao khi gas vuot nguong", gasValue);
  }

  if (currentRainAlert && !previousRainAlert) {
    publishAlert("rain", "Phat hien trang thai mua", rain);
  }

  if (currentTempAlert && !previousTempAlert) {
    publishAlert("temperature", "Nhiet do vuot nguong an toan", temperature);
  }

  if (currentMotionAlert && !previousMotionAlert) {
    publishAlert("motion", "Phat hien chuyen dong", motion);
  }

  previousGasAlert = currentGasAlert;
  previousRainAlert = currentRainAlert;
  previousTempAlert = currentTempAlert;
  previousMotionAlert = currentMotionAlert;
}

void setup() {
  Serial.begin(115200);

  pinMode(rainPin, INPUT_PULLUP);
  pinMode(pirPin, INPUT);

  pinMode(lampPin, OUTPUT);
  pinMode(awningPin, OUTPUT);
  pinMode(windowPin, OUTPUT);
  pinMode(fanPin, OUTPUT);
  pinMode(dehumidifierPin, OUTPUT);
  pinMode(securityAlarmPin, OUTPUT);
  pinMode(gasAlarmPin, OUTPUT);
  pinMode(gasValvePin, OUTPUT);

  writeLedStates();

  dht.begin();
  connectWiFi();

  mqttClient.setServer(mqttBroker, mqttPort);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024);
}

void loop() {
  connectWiFi();
  connectMqtt();
  mqttClient.loop();

  updateRainToggle();

  unsigned long currentMillis = millis();
  if (currentMillis - lastPublishMillis < publishInterval) return;
  lastPublishMillis = currentMillis;

  readSensors();
  applyOutputStates();

  publishSensorData();
  publishDeviceStatus();
  publishAlertsWhenNeeded();
}
