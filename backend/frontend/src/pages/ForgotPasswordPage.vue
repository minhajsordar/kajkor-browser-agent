<template>
  <div class="flex justify-center items-center auth-page-container">
    <div>
      <div class="q-gutter-y-md" style="max-width: 600px">
        <q-card>
          <q-card-section>
            <div class="w-96">
              <div class="mb-2">
                <div class="flex gap-1">
                  <q-img src="/logo.png" width="30px" height="30px" />
                  <h6>Welcome back!</h6>
                </div>
                <p class="text-lg text-black/50 mt-2">
                  Forgot your password? Contact us to reset it.
                </p>
              </div>

              <div class="flex justify-end">
                <router-link
                  to="/login"
                  class="block mt-2 text-sm font-medium text-primary"
                >
                  Back to login</router-link
                >
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </div>
</template>
<script setup></script>
<style scoped>
.auth-page-container {
  width: 100vw;
  height: calc(100vh - 50px);
  /* background-image: url('/images/loginpage-image.jpg'); */
  background-image: url("/images/bgphoto-1125683587-612x612.jpg");
  background-size: cover;
}
</style>
