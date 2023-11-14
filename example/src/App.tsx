import {
  Text,
  View,
  Alert,
  Modal,
  Linking,
  Platform,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import React, { useState, useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ometria, { OmetriaNotificationData } from 'react-native-ometria';
import { RESULTS, requestNotifications } from 'react-native-permissions';

import { version, ometria_sdk_version } from '../../package.json';
import { Events, demoBasketItems } from './data';
import { ModalReinitializationProps } from './models';

const App = () => {
  // If you want to use the reinitialization feature, you need to set the token as a state
  // If not you can set the token as a constant
  const [ometriaToken, setOmetriaToken] = useState(''); // OMETRIA_API_TOKEN

  const [initPN, setInitPN] = useState(false); // isReady to initialize Push Notification
  const [notificationContent, setNotificationContent] = useState(
    'Interract with a notification to see its content here.'
  );

  const [authModal, setAuthModal] = useState(false);
  const [evtsModal, setEvtsModal] = useState(false);

  // METHODS

  /**
   * Initialize Ometria with the API Token
   *
   * Additionally you can pass an options object to customize the SDK behavior,
   * for example you can set the notification channel name for Android.
   *
   * @param token String
   */
  const handleOmetriaInit = async (token: string) => {
    try {
      Ometria.initializeWithApiToken(token, {
        notificationChannelName: 'Example Channel Name',
      }).then(
        async () => {
          console.log('🎉 Ometria has been initialized!');
          Ometria.isLoggingEnabled(true);
          setAuthModal(false);

          // Ready to initialize Push Notifications handler
          await requestPNPermission();

          // This needs to be called after the SDK has been initialized in order to enable the SDK event emitter for Notification event
          Ometria.onDeepLinkInteracted();

          setInitPN(true);
        },
        (error) => {
          throw error;
        }
      );
    } catch (error) {
      console.error('😕 Error: ', error);
    }
  };

  /**
   * Request Push Notifications permission
   *
   * - `react-native-permissions` for Android 13+ (or other library)
   * - `react-native-firebase` for iOS (or react-native-permissions - up to you)
   *
   * until `react-native-firebase` supports Android 13+ notifications permissions.
   * See https://github.com/invertase/react-native-firebase/issues/6283

   */
  const requestPNPermission = async () => {
    if (Platform.OS === 'android') {
      requestNotifications([]).then(
        ({ status }) =>
          status === RESULTS.GRANTED &&
          console.log('🔔🤖 Push Notification permissions granted!')
      );
      return;
    }

    const status = await messaging().requestPermission({
      sound: true,
      badge: true,
      alert: true,
    });

    if (
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL
    ) {
      console.log('🔔🍏 Push Notification permissions granted!');
    }
  };

  /**
   * Handle Push Notifications
   *
   * #### iOS & Android:
   * - Provides Ometria SDK with the FCM token
   * - Listen for new FCM tokens and provide them to the Ometria SDK
   * - Set up a listener for user interaction with push notifications
   *
   * #### Android only
   * - Subscribe to foreground PN messages
   * - Subscribe to background PN messages
   *
   * (On iOS the SDK handles Firebase PN background messages.)
   *
   * @returns unsubscribeFromMessages function
   */
  const handlePushNotifications = () => {
    if (!initPN) {
      return;
    }

    // Provides Ometria SDK with the FCM token
    messaging()
      .getToken()
      .then((pushToken: string) => {
        Ometria.onNewToken(pushToken);
        console.log('🔑 Firebase token:', pushToken);
      });

    // Listen for new FCM tokens and provide them to the Ometria SDK
    messaging().onTokenRefresh((pushToken: string) =>
      Ometria.onNewToken(pushToken)
    );

    // Set up a listener for user interaction with push notifications
    Ometria.onNotificationInteracted((response: OmetriaNotificationData) => {
      console.log('🔔 Notification Interacted', response);
      setNotificationContent(JSON.stringify(response));

      if (response.deepLinkActionUrl) {
        // Handle deep linking open URL action
        Ometria.trackDeepLinkOpenedEvent(response.deepLinkActionUrl, 'Browser');
        Linking.openURL(response.deepLinkActionUrl);
      }
    });

    /*
     * Android only
     *
     * - Subscribe to foreground PN messages
     * - Subscribe to background PN messages
     *
     * On iOS the SDK handles Firebase PN background messages.
     * */

    if (Platform.OS !== 'android') {
      return;
    }

    const unsubscribeFromMessages = messaging().onMessage(
      async (remoteMessage: any) => {
        console.log('📭 Foreground message received:', remoteMessage);
        Ometria.onMessageReceived(remoteMessage);
      }
    );

    messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('📫 Background message received:', remoteMessage);
      Ometria.onMessageReceived(remoteMessage);
    });

    return unsubscribeFromMessages;
  };

  /**
   * Handle Deeplinking
   * @param payload {url: String}
   */
  const handleDeepLinking = ({ url }: any) => {
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Ometria.processUniversalLink(url).then(
          (response) => {
            Alert.alert('🔗 URL processed:', response);
          },
          (error) => {
            console.log(error);
            Alert.alert('🔗 Unable to process URL: ' + url);
          }
        );
      }
    });
  };

  /**
   * Handle Login by Email or UserId
   * @param method {userEmail?: String, customerId?: String}
   */
  const handleLogin = (method: { userEmail?: string; userId?: string }) => {
    method.userEmail &&
      Ometria.trackProfileIdentifiedByEmailEvent(method.userEmail!);
    method.userId &&
      Ometria.trackProfileIdentifiedByCustomerIdEvent(method.userId!);
    setAuthModal(false);
  };

  /**
   * Saving Ometria API Token to Local Storage
   *
   * - Save token to Local Storage
   * - Initialize Ometria SDK
   *
   * (Optional: You could use a static token instead of Local Storage)
   */
  const saveNewOmetriaToken = async (
    newToken: string,
    initializeWithNewToken: (token: string) => Promise<void>
  ) => {
    if (newToken === '') {
      return;
    }
    AsyncStorage.setItem('token', newToken);
    console.log('🔐 New Token. Ometria will reinitialize');
    initializeWithNewToken(newToken);
  };

  const handleOmetriaInitWithReinitialization = async () => {
    const savedToken = await AsyncStorage.getItem('token');
    if (savedToken === null) {
      setAuthModal(true);
      return;
    }
    setOmetriaToken(savedToken);
    handleOmetriaInit(savedToken);
    console.log('💾 Token from LocalStorage:', savedToken);
  };

  // EFFECTS

  /**
   * Initialize with useEffect:
   *
   * 1. Ometria init handler with or without reinitialization
   * 2. Push Notifications handler ONLY after Ometria initialization (initPN === true)
   * 3. Deeplink handler
   *
   */

  useEffect(() => {
    // This is optional if you want to use the reinitialization feature
    // If not, you can call handleOmetriaInit here directly with the token as a parameter
    handleOmetriaInitWithReinitialization();
  }, []);

  useEffect(handlePushNotifications, [initPN]);

  useEffect(() => {
    const subscribe = Linking.addEventListener('url', handleDeepLinking);
    return () => subscribe.remove();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ometria React Native Demo {version}</Text>
      <Text style={styles.subtitle}>
        {Platform.OS === 'android' ? 'Android' : 'iOS'} SDK version{' '}
        {ometria_sdk_version[Platform.OS === 'android' ? 'android' : 'ios']}
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => setAuthModal(true)}>
        <Text style={styles.text}>Change Login Info 🔐 </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={() => setEvtsModal(true)}>
        <Text style={styles.text}>Go to Events 📝</Text>
      </TouchableOpacity>

      <View>
        <Text style={styles.textBold}>🔔 Notification Content: </Text>
        <Text>{notificationContent}</Text>
      </View>

      <EventsModal isVisible={evtsModal} onClose={() => setEvtsModal(false)} />
      <AuthModal
        isVisible={authModal}
        onClose={() => setAuthModal(false)}
        onLogin={handleLogin}
        /* Only for  reinitialization feature */
        reinitialization={{
          ometriaToken,
          setOmetriaToken,
          saveNewOmetriaToken,
          handleOmetriaInit,
        }}
      />
    </View>
  );
};

// MODALS

/* <EventsModal />
 * A component that lists events and allows you to send them
 * */

const EventsModal: React.FC<{
  isVisible: boolean;
  onClose: () => void;
}> = ({ isVisible, onClose }) => {
  const sendEvent = (eventType: string) => {
    switch (eventType) {
      case Events.ENABLE_LOGGING:
        Ometria.isLoggingEnabled(true);
        break;
      case Events.DEEPLINK_OPENED_EVENT:
        Ometria.trackDeepLinkOpenedEvent('/profile', 'ProfileScreen');
        break;
      case Events.SCREEN_VIEWED:
        Ometria.trackScreenViewedEvent('OnboardingScreen', { a: '1', b: '2' });
        break;
      case Events.HOME_SCREEN_VIEWED:
        Ometria.trackHomeScreenViewedEvent();
        break;
      case Events.PROFILE_IDENTIFIED_BY_EMAIL:
        Ometria.trackProfileIdentifiedByEmailEvent('test@gmail.com');
        break;
      case Events.PROFILE_IDENTIFIED_BY_CUSTOMER_ID:
        Ometria.trackProfileIdentifiedByCustomerIdEvent('test_customer_id');
        break;
      case Events.PROFILE_DEIDENTIFIED:
        Ometria.trackProfileDeidentifiedEvent();
        break;
      case Events.PRODUCT_VIEWED:
        Ometria.trackProductViewedEvent('productId-1');
        break;
      case Events.PRODUCT_LISTING_VIEWED:
        Ometria.trackProductListingViewedEvent('product_list', {});
        break;
      case Events.BASKET_VIEWED:
        Ometria.trackBasketViewedEvent();
        break;
      case Events.BASKET_UPDATED:
        Ometria.trackBasketUpdatedEvent({
          totalPrice: 12.0,
          id: 'basket_id_eg',
          currency: 'USD',
          items: demoBasketItems,
          link: 'link_eg',
        });
        break;
      case Events.CHECKOUT_STARTED:
        Ometria.trackCheckoutStartedEvent('orderId-1');
        break;
      case Events.ORDER_COMPLETED:
        Ometria.trackOrderCompletedEvent('orderId-1', {
          totalPrice: 12.0,
          currency: 'USD',
          items: demoBasketItems,
          link: 'link_eg',
          id: 'basket_id_eg',
        });
        break;
      case Events.CUSTOM:
        Ometria.trackCustomEvent('my_custom_type', {});
        break;
      case Events.FLUSH:
        Ometria.flush();
        break;
      case Events.CLEAR:
        Ometria.clear();
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Events 📝</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.text}>CLOSE EVENTS</Text>
        </TouchableOpacity>
        <ScrollView>
          {Object.values(Events).map((eventValue) => (
            <TouchableOpacity
              key={eventValue}
              style={styles.btn}
              onPress={() => sendEvent(eventValue)}
            >
              <Text style={styles.text}>{eventValue}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
};

/*
 * <AuthModal />
 * A component to allow the user to change the login info
 * It is used to change the customerId or the userEmail
 * It is also used to save a new Ometria API Token if you want to use the reinitialization feature
 * */
const AuthModal: React.FC<{
  isVisible: boolean;
  onClose: () => void;
  onLogin: (method: { userEmail?: string; userId?: string }) => void;
  reinitialization: ModalReinitializationProps;
}> = ({ isVisible, onClose, onLogin, reinitialization }) => {
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Change Login Info 🔐</Text>
        <TextInput
          style={styles.input}
          placeholder="Ometria API TOKEN"
          placeholderTextColor="#000"
          value={reinitialization.ometriaToken}
          onChangeText={reinitialization.setOmetriaToken}
        />
        <TouchableOpacity
          style={styles.btn}
          onPress={() =>
            reinitialization.saveNewOmetriaToken(
              reinitialization.ometriaToken,
              reinitialization.handleOmetriaInit
            )
          }
        >
          <Text style={styles.text}>Save Ometria pushToken</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={userId}
          placeholder="Customer Id"
          placeholderTextColor="#000"
          onChangeText={setUserId}
        />
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            onLogin({ userId });
          }}
        >
          <Text style={styles.text}>Login with customer ID</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={userEmail}
          placeholderTextColor="#000"
          onChangeText={setUserEmail}
        />
        <TouchableOpacity
          style={styles.btn}
          onPress={() => onLogin({ userEmail })}
        >
          <Text style={styles.text}>Login with customer Email</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.text}>Close settings</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

export default App;

// STYLES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    paddingTop: Platform.OS === 'ios' ? 50 : 10,
  },
  title: {
    fontSize: 18,
    marginTop: 20,
    marginBottom: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  text: {
    color: '#FFF',
  },
  textBold: {
    fontWeight: 'bold',
    paddingVertical: 4,
  },
  input: {
    padding: 12,
    color: '#000',
    borderColor: '#33323A',
    borderWidth: StyleSheet.hairlineWidth,
  },
  btn: {
    padding: 12,
    marginVertical: 12,
    alignItems: 'center',
    backgroundColor: '#1e1f4d',
  },
  closeBtn: {
    padding: 12,
    marginVertical: 12,
    alignItems: 'center',
    backgroundColor: 'grey',
  },
});
